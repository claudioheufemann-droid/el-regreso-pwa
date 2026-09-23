import { Skeleton } from '@/components/ui/States'

export default function LogisticaLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <Skeleton height={28} width={200} className="bg-gray-800" />
          <Skeleton height={16} width={300} className="bg-gray-800/60 mt-2" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} height={110} className="bg-gray-800/80 rounded-xl" />
        ))}
      </div>
      <Skeleton height={280} className="bg-gray-800/50 rounded-xl w-full" />
    </div>
  )
}
