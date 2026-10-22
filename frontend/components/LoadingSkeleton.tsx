type LoadingSkeletonProps = {
  label: string;
  variant?: "dashboard" | "portfolio" | "detail" | "list" | "settings";
};

export default function LoadingSkeleton({ label, variant = "list" }: LoadingSkeletonProps) {
  const showCards = variant === "dashboard" || variant === "detail" || variant === "settings";
  return (
    <section role="status" aria-live="polite" aria-busy="true" className="space-y-5 p-6 sm:p-7">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        {(variant === "dashboard" || variant === "detail") && (
          <div className="rounded-[1.75rem] bg-slate-200 p-7">
            <div className="h-4 w-28 rounded bg-slate-300" />
            <div className="mt-5 h-7 w-3/4 rounded bg-slate-300" />
            <div className="mt-4 h-4 w-1/2 rounded bg-slate-300" />
          </div>
        )}
        {showCards && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="renewai-card space-y-4 p-5">
                <div className="h-3 w-2/3 rounded bg-slate-200" />
                <div className="h-6 w-1/2 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        )}
        <div className="renewai-card divide-y divide-slate-100 px-5">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-4 py-5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
