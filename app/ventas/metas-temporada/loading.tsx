// Skeleton con las mismas alturas que la vista del vendedor (hero, acumulado,
// lista de semanas) para que no haya saltos de layout al llegar los datos.
export default function MetasTemporadaLoading() {
  return (
    <div className="tw-spacing mx-auto w-full max-w-[1100px] px-4 pt-1 lg:px-6 lg:pt-4">
      <div className="mt-2 mb-1 h-9 w-24 rounded-full sk-metas" />
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-2 h-2.5 w-1/2 max-w-[220px] rounded sk-metas" />
          <div className="h-7 w-28 rounded-lg sk-metas" />
        </div>
        <div className="size-11 shrink-0 rounded-full sk-metas" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-[318px] rounded-[18px] sk-metas lg:h-[210px]" />
        <div className="h-[236px] rounded-[18px] sk-metas" />
        <div className="mt-2 h-3 w-40 rounded sk-metas" />
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[54px] rounded-[14px] sk-metas" />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes skmetas { 0% { background-position: -360px 0 } 100% { background-position: 360px 0 } }
        .sk-metas {
          background: linear-gradient(90deg, #141414 25%, #1A1A1A 37%, #141414 63%);
          background-size: 720px 100%;
          animation: skmetas 1.3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
