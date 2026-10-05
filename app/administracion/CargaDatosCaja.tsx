'use client'

/**
 * Carga manual de los dos datos que ningún informe del ERP entrega: saldo bancario
 * (por cuenta) y pagos a proveedores. Antes vivía dentro de FlujoCajaDashboard; desde
 * la auditoría del 2-oct-2026 va al pie de la pestaña Caja.
 */

import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import type { SaldoBanco } from './page'
import { BANCOS, BANCO_LABEL, type BancoId } from '@/lib/administracion/finanzas'
import { C, Card, Etiqueta } from './tema'

/** Alias de la paleta común (este archivo la llamaba P). */
const P = C


const fMoney = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('es-CL')
const fDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}



const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, border: `1px solid ${P.line}`,
  fontSize: 13, color: P.text, background: '#fff', boxSizing: 'border-box',
}

/**
 * Los dos datos que ningún informe del ERP entrega (saldo bancario y pagos a
 * proveedores) se cargan acá mismo. Sin esto el dashboard queda con la mitad
 * de las series en cero y el saldo acumulado sin punto de partida.
 */
export default function CargaDatosCaja({ hayCompras, saldoActual, hoyISO }: {
  hayCompras: boolean
  saldoActual: { fecha: string; total: number; porBanco: SaldoBanco[] } | null
  hoyISO: string
}) {
  const [banco, setBanco] = useState<BancoId>('chile')
  const [saldo, setSaldo] = useState('')
  const [fechaSaldo, setFechaSaldo] = useState(hoyISO)
  const [proveedor, setProveedor] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaPago, setFechaPago] = useState(hoyISO)
  const [fechaDoc, setFechaDoc] = useState('')
  const [estado, setEstado] = useState<'comprometida' | 'estimada' | 'pagada'>('comprometida')
  const [guardando, setGuardando] = useState<'saldo' | 'compra' | null>(null)
  const [ok, setOk] = useState<'saldo' | 'compra' | null>(null)
  const [error, setError] = useState('')

  async function guardar(tipo: 'saldo' | 'compra') {
    setGuardando(tipo); setError(''); setOk(null)
    try {
      const url = tipo === 'saldo' ? '/api/administracion/caja-saldo' : '/api/administracion/compras'
      const body = tipo === 'saldo'
        ? { fecha: fechaSaldo, banco, saldo: Number(saldo.replace(/[^\d-]/g, '')) }
        : {
          proveedor, monto: Number(monto.replace(/[^\d]/g, '')),
          fecha_pago: fechaPago, fecha_documento: fechaDoc || null, estado,
        }
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setOk(tipo)
      if (tipo === 'saldo') setSaldo('')
      else { setProveedor(''); setMonto(''); setFechaDoc('') }
      // El dashboard se arma en el servidor: hay que recargar para verlo.
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Card>
      <Etiqueta><Plus size={12} /> Datos que carga Administración</Etiqueta>
      <p style={{ fontSize: 12, color: P.muted, marginTop: 6, lineHeight: 1.5 }}>
        Ningún informe del ERP entrega el saldo de las 3 cuentas (Chile/Santander/Itaú) ni los pagos a
        proveedores con fecha futura, así que estos dos se cargan a mano. Sin el saldo, la columna &quot;Acumulado&quot;
        parte de cero; sin los pagos, las salidas son sólo una estimación desde el forecast de compras.
        {!hayCompras && <strong> Todavía no hay ningún pago a proveedor cargado.</strong>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 16 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 10 }}>Saldo de caja</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <select value={banco} onChange={e => setBanco(e.target.value as BancoId)} style={inputStyle}>
              {BANCOS.map(b => <option key={b} value={b}>{BANCO_LABEL[b]}</option>)}
            </select>
            <input value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="Saldo en la cuenta" inputMode="numeric" style={inputStyle} />
            <input type="date" value={fechaSaldo} onChange={e => setFechaSaldo(e.target.value)} style={inputStyle} />
            <button
              onClick={() => guardar('saldo')}
              disabled={!saldo || guardando === 'saldo'}
              style={{
                padding: '10px 0', borderRadius: 10, border: 'none',
                background: !saldo ? P.line : P.gold, color: !saldo ? P.muted : '#fff',
                fontSize: 13, fontWeight: 700, cursor: !saldo ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {ok === 'saldo' ? <><Check size={14} /> Guardado</> : guardando === 'saldo' ? 'Guardando…' : 'Guardar saldo'}
            </button>
          </div>
          {/* Último cargado DEL BANCO ELEGIDO, no el total — guardar Santander
              no tiene que hacer parecer que Chile también se actualizó. */}
          {(() => {
            const ultimo = saldoActual?.porBanco.find(x => x.banco === banco)
            return ultimo ? (
              <p style={{ fontSize: 11.5, color: P.muted, marginTop: 8 }}>
                Último cargado de {BANCO_LABEL[banco]}: {fMoney(ultimo.saldo)} al {fDia(ultimo.fecha)}.
              </p>
            ) : (
              <p style={{ fontSize: 11.5, color: P.faint, marginTop: 8, fontStyle: 'italic' }}>
                {BANCO_LABEL[banco]} todavía no tiene ningún saldo cargado.
              </p>
            )
          })()}
        </div>

        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 10 }}>Pago a proveedor</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Proveedor" style={inputStyle} />
            <input value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto" inputMode="numeric" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, fontSize: 11, color: P.muted }}>
                Fecha de pago
                <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />
              </label>
              <label style={{ flex: 1, fontSize: 11, color: P.muted }}>
                Fecha factura (opcional)
                <input type="date" value={fechaDoc} onChange={e => setFechaDoc(e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />
              </label>
            </div>
            <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} style={inputStyle}>
              <option value="comprometida">En firme (compra real)</option>
              <option value="estimada">Estimada (proyectada)</option>
              <option value="pagada">Ya pagada</option>
            </select>
            <button
              onClick={() => guardar('compra')}
              disabled={!proveedor || !monto || guardando === 'compra'}
              style={{
                padding: '10px 0', borderRadius: 10, border: 'none',
                background: !proveedor || !monto ? P.line : P.gold, color: !proveedor || !monto ? P.muted : '#fff',
                fontSize: 13, fontWeight: 700, cursor: !proveedor || !monto ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {ok === 'compra' ? <><Check size={14} /> Guardado</> : guardando === 'compra' ? 'Guardando…' : 'Agregar pago'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: P.red, marginTop: 12, background: P.redSoft, padding: '8px 12px', borderRadius: 9 }}>
          {error}
        </p>
      )}
    </Card>
  )
}
