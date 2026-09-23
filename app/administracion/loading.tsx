import { Skeleton } from '@/components/ui/States'

export default function AdministracionLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <Skeleton height={28} width={220} className="bg-gray-800" />
          <Skeleton height={16} width={320} className="bg-gray-800/60 mt-2" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} height={100} className="bg-gray-800/80 rounded-xl" />
        ))}
      </div>
      <Skeleton height={300} className="bg-gray-800/50 rounded-xl w-full" />
    </div>
  )
}
