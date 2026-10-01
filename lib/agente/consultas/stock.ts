import { type Consulta, redondear, terminoSeguro, texto } from './_base'

export const stockActual: Consulta = {
  nombre: 'stock_actual',
  descripcion:
    'Stock actual de producto terminado (unidades y litros) por producto, según el último informe de stock del ERP. ' +
    'Usar para "¿cuánto stock hay de X?", "¿qué tenemos en bodega?".',
  parametros: [
    { nombre: 'producto', tipo: 'string', descripcion: 'Parte del nombre del producto. Omitir para ver todo.' },
  ],
  async ejecutar(args, ctx) {
    const { data: ultimo, error: e1 } = await ctx.admin.from('stock_productos')
      .select('fecha_informe').order('fecha_informe', { ascending: false }).limit(1)
    if (e1) throw new Error(e1.message)
    const fechaInforme = ultimo?.[0]?.fecha_informe as string | undefined
    if (!fechaInforme) return { nota: 'No hay informes de stock cargados.' }

    const prod = texto(args.producto) && terminoSeguro(texto(args.producto)!)
    let q = ctx.admin.from('stock_productos')
      .select('producto, categoria, cantidad, litros').eq('fecha_informe', fechaInforme).limit(1000)
    if (prod) q = q.ilike('producto', `%${prod}%`)
    const { data, error } = await q
    if (error) throw new Error(error.message)

    const acc = new Map<string, { categoria: string | null; cantidad: number; litros: number }>()
    for (const f of data ?? []) {
      const a = acc.get(f.producto) ?? { categoria: f.categoria, cantidad: 0, litros: 0 }
      a.cantidad += Number(f.cantidad) || 0; a.litros += Number(f.litros) || 0
      acc.set(f.producto, a)
    }
    return {
      fecha_informe: fechaInforme,
      productos: [...acc.entries()].sort((a, b) => b[1].litros - a[1].litros).slice(0, 40)
        .map(([producto, v]) => ({ producto, categoria: v.categoria, unidades: v.cantidad, litros: redondear(v.litros) })),
    }
  },
}
