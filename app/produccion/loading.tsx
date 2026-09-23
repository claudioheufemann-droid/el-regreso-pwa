import { Skeleton } from '@/components/ui/States'

export default function ProduccionLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-100 flex">
      {/* Skeleton del menú lateral */}
      <div className="w-64 border-r border-gray-800 p-4 hidden md:block shrink-0">
        <Skeleton height={40} className="mb-6 bg-gray-800" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} height={36} className="bg-gray-800/60" />
          ))}
        </div>
      </div>

      {/* Skeleton del área principal */}
      <div className="flex-1 p-6 space-y-6 overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <Skeleton height={28} width={220} className="bg-gray-800" />
            <Skeleton height={16} width={340} className="bg-gray-800/60 mt-2" />
          </div>
          <Skeleton height={38} width={140} className="bg-gray-800" />
        </div>

        {/* Tarjetas KPI de resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} height={96} className="bg-gray-800/80 rounded-xl" />
          ))}
        </div>

        {/* Área de gráfico/tablero principal */}
        <Skeleton height={320} className="bg-gray-800/50 rounded-xl w-full" />
      </div>
    </div>
  )
}
