'use client'

import { useEffect, useState } from 'react'
import { Wallet, ArrowRight, X, TrendingUp, AlertTriangle, Check } from 'lucide-react'
import {
  BONO_COBRANZA_TIERS, BONO_RETENCION,
  fComision,
  type ResumenComisionVendedor, type CanalVenta, type CarteraVendedor,
} from '@/lib/comisionesVendedor'
import { proyectarAlCierre } from '@/lib/comisiones'
import { C } from './theme'

/**
 * "Lo que gano yo" para vendedores bajo la cláusula TERCERA de su
 * contrato (Yadro Fabijancic, Marcelo Diaz) — mismo componente y mismo
 * lenguaje visual que app/ventas/MiComision.tsx (el de Claudio), pero
 * con las reglas de SU contrato: comisión escalonada por canal, Bono
 * Apertura, Bono Recompra, Bono Cobranza y Bono Retención de cartera.
 *
 * Dos modos:
 *  · Sin prop `vendedor` (uso en /terreno): sólo se monta si el vendedor
 *    logueado tiene este contrato — el endpoint deriva el vendedor de la
 *    sesión, nunca de un parámetro, así que no hay forma de pedir la
 *    comisión de otro vendedor.
 *  · Con prop `vendedor` (uso en /ventas/comisiones, sólo admins con
 *    puede_ver_margenes): pide explícitamente la comisión de ESE
 *    vendedor. El control de acceso real vive en el endpoint (ver
 *    app/api/ventas/comision-vendedor/route.ts) — acá sólo cambia el
 *    texto de "yo" a su nombre.
 */

interface Payload {
  vendedor: string
  resumen: ResumenComisionVendedor
  canales: CanalVenta[]
  cartera: CarteraVendedor
  porEntregar: { ventaNeta: number; litros: number; pedidos: number }
}

export default function MiComisionVendedor({ desde, hasta, nombrePeriodo, vendedor, nombreMostrar, isDesktop = false }: {
  desde: string; hasta: string; nombrePeriodo: string
  /** Nombre canónico (ej. "Marcelo Diaz") — sólo para la vista de admin. Omitir para la vista propia. */
  vendedor?: string
  /** Primer nombre para los textos ("gana Marcelo", "lleva ganado") — requerido junto con `vendedor`. */
  nombreMostrar?: string
  /** Desktop: número principal más grande y hoja de detalle como modal
   *  centrado — mismo tratamiento que app/ventas/MiComision.tsx. */
  isDesktop?: boolean
}) {
  const esPropio = !vendedor
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vivo = true
    const qs = new URLSearchParams({ desde, hasta })
    if (vendedor) qs.set('vendedor', vendedor)
    fetch(`/api/ventas/comision-vendedor?${qs.toString()}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setData(d) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [desde, hasta, vendedor])

  if (error) return null           // sin este contrato o error: la tarjeta no existe
  if (!data) return <Esqueleto />

  const { resumen, porEntregar } = data
  const proyeccion = proyectarAlCierre(resumen.variableTotal, desde, hasta)
  // Sólo la comisión escalonada reacciona al pipeline con la tasa actual;
  // los bonos de apertura/recompra/cobranza/retención no se proyectan
  // porque dependen de eventos puntuales, no de un monto continuo.
  const tasaPromedio = resumen.ventaNeta > 0
    ? (resumen.comision / resumen.ventaNeta)
    : (resumen.tasaHorecaTradicional + resumen.tasaRetailDistribuidor) / 2
  const comisionPipeline = porEntregar.ventaNeta * tasaPromedio
  const totalConPipeline = resumen.variableTotal + comisionPipeline

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        style={{
          background: C.hero, borderRadius: 18, padding: isDesktop ? 24 : 18, width: '100%',
          border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(245,158,11,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={18} color="#F59E0B" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
              {esPropio ? 'LO QUE GANO YO' : `LO QUE GANA ${nombreMostrar?.toUpperCase()}`}
            </p>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
              Comisión y bonos · {nombrePeriodo}
            </p>
          </div>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowRight size={16} color="#F59E0B" />
          </span>
        </div>

        <p style={{ fontSize: isDesktop ? 40 : 30, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
          {fComision(resumen.variableTotal)}
        </p>
        <p style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 4 }}>
          {esPropio ? 'llevas ganado en el período' : `${nombreMostrar} lleva ganado en el período`}
        </p>

        {comisionPipeline > 0 && (
          <p style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TrendingUp size={13} />
            +{fComision(comisionPipeline)} si se entrega el pipeline → {fComision(totalConPipeline)} en total
          </p>
        )}
        {proyeccion !== null && proyeccion > resumen.variableTotal && (
          <p style={{ fontSize: 12, color: '#34D399', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TrendingUp size={13} />
            Al ritmo de hoy, cerrarías el período en {fComision(proyeccion)}
          </p>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: isDesktop ? '18px 0 16px' : '14px 0 12px' }} />

        <div style={isDesktop ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 } : { display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={isDesktop ? { minWidth: 0 } : { flex: '1 1 120px', minWidth: 0 }}>
            <p style={{ fontSize: isDesktop ? 12.5 : 11, color: '#94A3B8' }}>Comisión ({resumen.tramo})</p>
            <p style={{ fontSize: isDesktop ? 25 : 17, fontWeight: 800, color: '#34D399', letterSpacing: '-0.4px', marginTop: isDesktop ? 4 : 3, whiteSpace: 'nowrap' }}>
              {fComision(resumen.comision)}
            </p>
            <p style={{ fontSize: isDesktop ? 11.5 : 10.5, color: '#94A3B8', marginTop: isDesktop ? 2 : 1 }}>de {fComision(resumen.ventaNeta)} entregado</p>
          </div>
          <div style={isDesktop ? { minWidth: 0 } : { flex: '1 1 120px', minWidth: 0 }}>
            <p style={{ fontSize: isDesktop ? 12.5 : 11, color: '#94A3B8' }}>Bonos</p>
            <p style={{ fontSize: isDesktop ? 25 : 17, fontWeight: 800, color: '#F59E0B', letterSpacing: '-0.4px', marginTop: isDesktop ? 4 : 3, whiteSpace: 'nowrap' }}>
              {fComision(resumen.bonoApertura + resumen.bonoRecompra + resumen.bonoCobranza + resumen.bonoRetencion)}
            </p>
            <p style={{ fontSize: isDesktop ? 11.5 : 10.5, color: '#94A3B8', marginTop: isDesktop ? 2 : 1 }}>apertura + recompra + cartera</p>
          </div>
        </div>
      </button>

      {abierto && (
        <HojaDetalle
          data={data} desde={desde} hasta={hasta} nombrePeriodo={nombrePeriodo}
          titulo={esPropio ? 'Lo que gano yo' : `Lo que gana ${nombreMostrar}`}
          onClose={() => setAbierto(false)}
          isDesktop={isDesktop}
        />
      )}
    </>
  )
}

function Esqueleto() {
  return (
    <div style={{ background: C.hero, borderRadius: 18, padding: 18, opacity: 0.5 }}>
      <div style={{ height: 12, width: 130, borderRadius: 4, background: 'rgba(255,255,255,.12)', marginBottom: 14 }} />
      <div style={{ height: 30, width: 180, borderRadius: 6, background: 'rgba(255,255,255,.12)' }} />
    </div>
  )
}

// ─── Detalle ────────────────────────────────────────────────────────────────

function HojaDetalle({ data, desde, hasta, nombrePeriodo, titulo, onClose, isDesktop = false }: {
  data: Payload; desde: string; hasta: string; nombrePeriodo: string; titulo: string; onClose: () => void
  isDesktop?: boolean
}) {
  const { resumen } = data

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.45)', display: 'flex',
        flexDirection: 'column', justifyContent: isDesktop ? 'center' : 'flex-end',
        alignItems: isDesktop ? 'center' : 'stretch',
      }}
    >
      <div style={{
        background: C.bg, display: 'flex', flexDirection: 'column',
        ...(isDesktop
          ? { borderRadius: 20, maxHeight: '85vh', width: '640px', maxWidth: '92vw', boxShadow: '0 24px 60px rgba(15,23,42,.35)' }
          : { borderRadius: '20px 20px 0 0', maxHeight: '90vh' }),
      }}>
        {!isDesktop && (
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>
        )}

        <div style={{ padding: isDesktop ? '16px 20px 12px' : '4px 16px 12px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{titulo}</p>
              <p style={{ fontSize: 12, color: C.muted }}>{nombrePeriodo} · {desde} a {hasta}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#E2E8F0', color: C.text, cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ background: C.hero, borderRadius: 14, padding: '12px 14px', marginTop: 12 }}>
            <p style={{ fontSize: 11, color: '#94A3B8' }}>Variable bruto del período</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
              {fComision(resumen.variableTotal)}
            </p>
            <p style={{ fontSize: 11.5, color: '#CBD5E1', marginTop: 3 }}>
              comisión + bonos por venta, apertura, recompra y cartera
            </p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
          <Resumen resumen={resumen} cartera={data.cartera} />
        </div>
      </div>
    </div>
  )
}

function Resumen({ resumen, cartera }: { resumen: ResumenComisionVendedor; cartera: CarteraVendedor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Comisión escalonada */}
      <Bloque titulo={`COMISIÓN ESCALONADA · ${resumen.tramo}`} monto={resumen.comision} color={C.green}>
        <Linea label="Venta HORECA + Tradicional" valor={fComision(resumen.ventaHorecaTradicional)} />
        <Linea label={`Tasa HORECA + Tradicional`} valor={`${(resumen.tasaHorecaTradicional * 100).toLocaleString('es-CL', { minimumFractionDigits: 2 })}%`} />
        <Linea label="Venta Retail + Distribuidor" valor={fComision(resumen.ventaRetailDistribuidor)} />
        <Linea label="Tasa Retail + Distribuidor" valor={`${(resumen.tasaRetailDistribuidor * 100).toLocaleString('es-CL', { minimumFractionDigits: 2 })}%`} />
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          El tramo lo determina la venta neta total del período (ambos canales
          sumados); dentro del tramo, cada canal comisiona a su propia tasa.
        </p>
      </Bloque>

      {/* Bono Apertura */}
      <Bloque titulo="BONO APERTURA" monto={resumen.bonoApertura} color={resumen.bonoApertura > 0 ? C.green : C.faint}>
        {resumen.aperturas.length === 0
          ? <Linea label="Clientes nuevos este período" valor="0" />
          : resumen.aperturas.map((e, i) => (
            <Linea key={i} label={`${e.cliente} · ${fFecha(e.fecha)}`} valor={fComision(e.monto)} />
          ))}
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          Se paga por la primera venta a un cliente nuevo, o que no compraba
          hace más de 2 años. Ventas bajo $100.000 no tienen tramo asignado en
          el contrato, así que no generan bono.
        </p>
      </Bloque>

      {/* Bono Recompra */}
      <Bloque titulo="BONO RECOMPRA" monto={resumen.bonoRecompra} color={resumen.bonoRecompra > 0 ? C.green : C.faint}>
        {resumen.recompras.length === 0
          ? <Linea label="Recompras este período" valor="0" />
          : resumen.recompras.map((e, i) => (
            <Linea key={i} label={`${e.cliente} · ${fFecha(e.fecha)}`} valor={fComision(e.monto)} />
          ))}
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          Se paga cuando un cliente que gatilló un Bono Apertura vuelve a
          comprar dentro de los 30 días siguientes.
        </p>
      </Bloque>

      {/* Bono Cobranza */}
      <Bloque titulo="BONO COBRANZA" monto={resumen.bonoCobranza} color={resumen.bonoCobranza > 0 ? C.green : C.faint}>
        <Linea label="Clientes al día" valor={`${cartera.clientesAlDia} de ${cartera.clientesConVenta}`} />
        <Linea label="Cumplimiento" valor={fPct(resumen.pctAlDia)} destacado color={resumen.bonoCobranza > 0 ? C.green : C.amber} />
        {resumen.proximaCobranza && (
          <Linea
            label={`Al llegar a ${resumen.proximaCobranza.minimoPct}%`}
            valor={fComision(resumen.proximaCobranza.bono)}
            destacado color={C.green}
          />
        )}
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          Sobre la cartera con venta en el período: {BONO_COBRANZA_TIERS.map(t => `${t.minimoPct}%+ → ${fComision(t.bono)}`).join(' · ')}.
        </p>
      </Bloque>

      {/* Bono Retención */}
      <Bloque titulo="BONO RETENCIÓN DE CARTERA" monto={resumen.bonoRetencion} color={resumen.bonoRetencion > 0 ? C.green : C.faint}>
        <Linea label="Clientes activos" valor={`${cartera.clientesActivos} de ${cartera.clientesCartera}`} />
        <Linea label="Activación" valor={fPct(resumen.pctActivacion)} destacado color={resumen.bonoRetencion > 0 ? C.green : C.amber} />
        <Linea label="Interacciones registradas" valor={String(cartera.interacciones)} />
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          {fComision(BONO_RETENCION.monto)} si al menos el {BONO_RETENCION.minimoPct}% de la
          cartera está activa (≥2 interacciones + ≥1 pedido en el período,
          entregado dentro del mes). Las interacciones salen de las visitas en Terreno.
        </p>
      </Bloque>

      <div style={{ background: C.amberSoft, borderRadius: 14, border: '1px solid #FDE68A', padding: 14 }}>
        <p style={{ fontSize: 11.5, fontWeight: 800, color: C.amber, letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} /> BONO APERTURA CADENA RETAIL
        </p>
        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          Al abrir una cadena retail de 6 o más salas, el contrato contempla un
          bono único de $1.000.000 a $2.000.000, sujeto a evaluación y
          aprobación de la Gerencia Comercial. No es una regla automática — se
          define caso a caso, así que no está incluido en el cálculo de arriba.
        </p>
      </div>

      <p style={{ fontSize: 11, color: C.faint, textAlign: 'center', lineHeight: 1.6, padding: '4px 8px 0' }}>
        Montos brutos, antes de imposiciones.
      </p>
    </div>
  )
}

function fFecha(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const fPct = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`

function Bloque({ titulo, monto, color, children }: {
  titulo: string; monto: number; color: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.line}`, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.04em' }}>{titulo}</p>
        <p style={{ fontSize: 17, fontWeight: 800, color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
          {monto > 0 && <Check size={15} />}
          {fComision(monto)}
        </p>
      </div>
      {children}
    </div>
  )
}

function Linea({ label, valor, destacado = false, color }: {
  label: string; valor: string; destacado?: boolean; color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
      <span style={{ fontSize: 12.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: destacado ? 800 : 600, color: color ?? C.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{valor}</span>
    </div>
  )
}
