// Skeleton claro con la misma composición que la pantalla (encabezado,
// semana con tres indicadores, tabla de semanas) para que no haya saltos de
// layout al llegar los datos.
export default function MetasTemporadaLoading() {
  return (
    <div className="cc-root tw-spacing metas-claro w-full px-4 pt-1 md:px-6 lg:px-8 lg:pt-4" data-theme="light">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="pb-4">
          <div className="my-2 h-4 w-16 rounded sk-metas" />
          <div className="mt-1 flex items-end justify-between gap-4">
            <div className="h-8 w-56 rounded-md sk-metas" />
            <div className="hidden h-6 w-72 rounded sk-metas md:block" />
          </div>
        </div>
        <div className="border-t border-[var(--cc-line)] pt-5">
          <div className="mb-4 h-6 w-64 rounded sk-metas" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map(i => <div key={i} className="h-[92px] rounded-lg sk-metas" />)}
          </div>
          <div className="mt-4 h-4 w-80 max-w-full rounded sk-metas" />
          <div className="mt-6 border-t border-[var(--cc-line)] pt-5">
            <div className="mb-3 h-5 w-52 rounded sk-metas" />
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="mb-1.5 h-[38px] rounded sk-metas" />)}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes skmetas { 0% { background-position: -360px 0 } 100% { background-position: 360px 0 } }
        .sk-metas {
          background: linear-gradient(90deg, #F3F1EC 25%, #EAE7E1 37%, #F3F1EC 63%);
          background-size: 720px 100%;
          animation: skmetas 1.3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
