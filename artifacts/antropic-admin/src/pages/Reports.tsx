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
function SalesBars({ series }: { series: SalesByDay[] }) {
  const values = series.map((d) => Number(d.revenue));
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-32 items-end gap-0.5 overflow-x-auto">
      {series.map((d) => (
        <div
          key={d.date}
          className="min-w-[4px] flex-1 rounded-t bg-slate-800/80 hover:bg-slate-900"
          style={{ height: `${(Number(d.revenue) / max) * 100}%` }}
          title={`${d.date}: ${soles(d.revenue)} · ${d.orders} pedidos`}
        />
      ))}
    </div>
  );
}
