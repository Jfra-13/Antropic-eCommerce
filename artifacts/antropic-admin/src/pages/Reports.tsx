import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useGetSalesReport, type SalesByDay } from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";
import { TopProducts } from "./Dashboard";

// Preset ranges as day offsets; the API defaults to last 30 days when params are omitted.
const PRESETS = [
  { label: "Últimos 7 días", days: 7 },
  { label: "Últimos 30 días", days: 30 },
  { label: "Últimos 90 días", days: 90 },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const params = { from: isoDaysAgo(days), to: today() };
  const { data, isLoading, isError, error, refetch, isFetching } = useGetSalesReport(params);

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reportes</h1>
          <p className="text-sm text-slate-500">Ventas, funnel y carritos abandonados.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          >
            {PRESETS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Ventas" value={soles(data.revenue)} />
            <Stat label="Pedidos pagados" value={String(data.orders)} />
            <Stat label="Unidades vendidas" value={String(data.unitsSold)} />
            <Stat label="Ticket promedio" value={soles(data.avgTicket)} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase text-slate-400">Conversión (funnel)</h2>
            <p className="text-sm text-slate-700">
              {data.cartConversionRate == null ? (
                <span className="text-slate-400">Sin carritos con ítems en el período.</span>
              ) : (
                <>
                  <strong>{data.cartConversionRate}%</strong> de los carritos con productos
                  terminaron en compra pagada.
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Nota: tráfico/visitas web no se miden todavía — esto es una tasa carrito→compra, no
              una conversión sobre visitas. Requiere analítica web (pendiente).
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase text-slate-400">Ventas por día</h2>
            <SalesBars series={data.salesByDay} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">Top ventas</h2>
              <TopProducts items={data.topProducts} />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">Carritos abandonados</h2>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <p className="text-slate-700">
                  Cantidad: <strong>{data.abandonedCarts.count}</strong>
                </p>
                <p className="text-slate-700">
                  Valor en riesgo: <strong>{soles(data.abandonedCarts.value)}</strong>
                </p>
                <p className="text-slate-700">
                  Recuperables (sin compras previas): <strong>{data.abandonedCarts.recoverable}</strong>
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Los recordatorios automáticos de carrito requieren un job programado (pendiente).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

// Minimal inline bar chart — no chart dependency for a simple daily series.
// Y axis with 0 / mid / max marks, first/last date on the X axis, an average
// reference line, and a real tooltip (date + revenue + orders) on hover.
function SalesBars({ series }: { series: SalesByDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (series.length === 0) {
    return <p className="text-sm text-slate-400">Sin ventas en el período.</p>;
  }

  const values = series.map((d) => Number(d.revenue));
  const max = Math.max(1, ...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const compact = (v: number) =>
    `S/ ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`;
  const dia = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });

  const ticks = [max, max / 2, 0];
  const hovered = hover !== null ? series[hover] : undefined;

  return (
    <div>
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="flex h-36 w-12 shrink-0 flex-col justify-between text-right text-[10px] text-slate-400">
          {ticks.map((t, i) => (
            <span key={i}>{compact(t)}</span>
          ))}
        </div>

        <div className="relative h-36 flex-1">
          {/* Gridlines at the tick marks + dashed average line */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 border-t border-slate-100" />
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-100" />
            <div className="absolute inset-x-0 bottom-0 border-t border-slate-200" />
            <div
              className="absolute inset-x-0 border-t border-dashed border-amber-500/70"
              style={{ bottom: `${(avg / max) * 100}%` }}
            />
          </div>

          <div className="flex h-full items-end gap-0.5" onMouseLeave={() => setHover(null)}>
            {series.map((d, i) => (
              <div
                key={d.date}
                onMouseEnter={() => setHover(i)}
                className="flex h-full min-w-[4px] flex-1 items-end"
              >
                <div
                  className={`w-full rounded-t ${hover === i ? "bg-slate-900" : "bg-slate-800/70"}`}
                  style={{ height: `${(Number(d.revenue) / max) * 100}%` }}
                />
              </div>
            ))}
          </div>

          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow"
              style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}
            >
              <div className="font-medium">{dia(hovered.date)}</div>
              <div>{soles(hovered.revenue)} · {hovered.orders} pedido{hovered.orders === 1 ? "" : "s"}</div>
            </div>
          )}
        </div>
      </div>

      {/* X axis: period bounds + average legend */}
      <div className="ml-14 mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{dia(series[0]!.date)}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-amber-500/70" />
          Promedio: {soles(avg.toFixed(2))}
        </span>
        <span>{dia(series[series.length - 1]!.date)}</span>
      </div>
    </div>
  );
}
