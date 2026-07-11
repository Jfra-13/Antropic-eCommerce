import { ChevronLeft, ChevronRight } from "lucide-react";

// Classic server-side paginator: ‹ 1 2 3 › plus a "showing X of Y" label.
// Renders nothing when everything fits on one page.
export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;

  // Window of up to 5 page numbers centered on the current page.
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  const shownFrom = (page - 1) * limit + 1;
  const shownTo = Math.min(page * limit, total);

  const btn = "min-w-8 rounded-md border px-2 py-1.5 text-sm disabled:opacity-40";

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs text-slate-500">
        Mostrando {shownFrom}–{shownTo} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            className={`${btn} ${
              n === page
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}
          aria-label="Página siguiente"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
