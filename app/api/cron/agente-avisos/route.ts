import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientesProximosAPedir } from '@/lib/agente/consultas/correos'
import { pedidoSugeridoCliente } from '@/lib/agente/consultas/comercial'
import { resolverVendedor } from '@/lib/agente/correos'
import { crearConversacion, guardarMensaje } from '@/lib/agente/memoria'
import { sendPushToUser } from '@/lib/push'
import { enviarEmailGmail } from '@/lib/email-gmail'

export const runtime = 'nodejs'
export const maxDuration = 60

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fFecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://el-regreso-pwa.vercel.app'

type Proximos = { clientes: { cliente: string; vendedor: string | null; proxima_compra_estimada: string; litros_por_pedido: number | null }[] }
type Sugerido = { clientes: { cliente: string; productos: { producto: string; envase: string | null }[] }[] }

/**
 * GET /api/cron/agente-avisos — todos los días; corre los avisos semanales del
 * Asistente (tabla agente_avisos) cuyo día toca hoy.
 *
 * Por cada aviso deja, en una conversación nueva del usuario, UN BORRADOR por
 * vendedor con sus clientes por pedir y qué ofrecerles, y le avisa (push +
 * correo) que están listos. Nunca envía nada a los vendedores: eso lo decide la
 * persona en el chat. El texto es una plantilla (no pasa por el modelo).
 * Idempotente por día: `ultima_ejecucion` se reserva antes de trabajar.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const hoyISO = new Date().toISOString().slice(0, 10)
  const diaIso = ((new Date(`${hoyISO}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 // 1 = lunes

  const { data: avisos, error } = await admin.from('agente_avisos')
    .select('id, usuario_id, dias_ventana, canal, ultima_ejecucion')
    .eq('activo', true).eq('dia_semana', diaIso)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: { aviso: string; borradores: number; error?: string }[] = []
  for (const aviso of avisos ?? []) {
    if (aviso.ultima_ejecucion && aviso.ultima_ejecucion >= hoyISO) continue
    // Reserva del día: si otra ejecución ya lo tomó, no hay fila que actualizar.
    const { data: reservado } = await admin.from('agente_avisos').update({ ultima_ejecucion: hoyISO })
      .eq('id', aviso.id).or(`ultima_ejecucion.is.null,ultima_ejecucion.lt.${hoyISO}`).select('id').maybeSingle()
    if (!reservado) continue

    try {
      const { data: usuario } = await admin.from('users').select('id, nombre, email, is_admin, puede_usar_asistente').eq('id', aviso.usuario_id).maybeSingle()
      if (!usuario?.is_admin && !usuario?.puede_usar_asistente) { resultados.push({ aviso: aviso.id, borradores: 0, error: 'El usuario ya no tiene acceso al asistente.' }); continue }
      const ctx = { admin, hoyISO, usuarioId: usuario.id }

      const proximos = await clientesProximosAPedir.ejecutar({ dias: aviso.dias_ventana }, ctx) as Proximos
      const porVendedor = new Map<string, Proximos['clientes']>()
      for (const c of proximos.clientes ?? []) {
        if (!c.vendedor) continue
        porVendedor.set(c.vendedor, [...(porVendedor.get(c.vendedor) ?? []), c])
      }

      const conv = await crearConversacion(admin, usuario.id, `Aviso semanal: clientes por pedir (${fFecha(hoyISO)})`)
      let borradores = 0
      const sinDestinatario: string[] = []
      for (const [vendedor, clientes] of porVendedor) {
        const destino = await resolverVendedor(admin, vendedor)
        if (!destino.ok) { sinDestinatario.push(vendedor); continue }
        const sugerido = await pedidoSugeridoCliente.ejecutar({ vendedor, productos_por_cliente: 2 }, ctx) as Sugerido
        const ofrecer = new Map((sugerido.clientes ?? []).map(s => [s.cliente, s.productos.map(p => p.producto).join(', ')]))
        const nombreCorto = destino.usuario.nombre.split(' ')[0]
        const lineas = clientes.map(c => {
          const litros = c.litros_por_pedido ? ` · suele pedir ~${Math.round(c.litros_por_pedido)} L` : ''
          const ofr = ofrecer.get(c.cliente) ? ` · ofrecer: ${ofrecer.get(c.cliente)}` : ''
          return `- ${c.cliente}: ${fFecha(c.proxima_compra_estimada)}${litros}${ofr}`
        })
        const cuerpo = [
          `Hola ${nombreCorto}:`, '',
          `Según su ciclo de compra, estos clientes deberían pedir en los próximos ${aviso.dias_ventana} días:`,
          ...lineas, '',
          '¿Puedes contactarlos esta semana?', '',
          `Saludos,\n${usuario.nombre}`,
        ].join('\n')
        const { error: e } = await admin.from('agente_correos').insert({
          conversacion_id: conv.id, creado_por: usuario.id, destinatario_id: destino.usuario.id, destinatario_nombre: destino.usuario.nombre,
          asunto: `Clientes por pedir: ${clientes.length} en los próximos ${aviso.dias_ventana} días`, cuerpo: cuerpo.slice(0, 5000), canal: aviso.canal,
        })
        if (!e) borradores++
      }

      await guardarMensaje(admin, conv.id, {
        rol: 'agente',
        texto: borradores
          ? `Aviso semanal: te dejé **${borradores} borradores**, uno por vendedor, con sus clientes por pedir en los próximos ${aviso.dias_ventana} días y qué ofrecerles. Revísalos abajo y envíalos con **Enviar**.`
            + (sinDestinatario.length ? `\n\nSin destinatario en la app: ${sinDestinatario.join(', ')}.` : '')
          : `Aviso semanal: esta semana no hay clientes por pedir en los próximos ${aviso.dias_ventana} días.`,
        herramientas: ['clientes_proximos_a_pedir', 'pedido_sugerido_cliente'],
      })

      if (borradores) {
        await sendPushToUser(usuario.id, { title: 'Borradores listos para revisar', body: `${borradores} correos de clientes por pedir, uno por vendedor.`, url: '/administracion/agente', tag: `agente-aviso-${aviso.id}` })
        if (usuario.email) {
          await enviarEmailGmail({
            toEmail: usuario.email,
            subject: `Tienes ${borradores} borradores de clientes por pedir para revisar`,
            html: `<p>Hola ${usuario.nombre.split(' ')[0]}:</p><p>El aviso semanal del Asistente dejó <strong>${borradores} borradores</strong>, uno por vendedor. No se envió nada todavía.</p><p><a href="${APP_URL}/administracion/agente">Revisarlos en el Asistente de datos</a></p>`,
          })
        }
      }
      resultados.push({ aviso: aviso.id, borradores })
    } catch (e) {
      console.error('[cron agente-avisos]', aviso.id, e)
      resultados.push({ aviso: aviso.id, borradores: 0, error: e instanceof Error ? e.message : 'error' })
    }
  }
  return NextResponse.json({ ok: true, dia: diaIso, resultados })
}
