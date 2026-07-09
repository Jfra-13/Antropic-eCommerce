import { Link } from "wouter";
import { RefreshCw, CreditCard, ShoppingCart, PackageX, Undo2 } from "lucide-react";
import { useGetDashboard, type TopProduct } from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useGetDashboard();

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">Resumen del día y alertas del backoffice.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Ventas hoy" value={soles(data.kpis.salesToday)} delta={data.kpis.salesTodayDeltaPct} deltaSuffix="%" />
            <Kpi label="Pedidos hoy" value={String(data.kpis.ordersToday)} delta={data.kpis.ordersTodayDelta} />
            <Kpi label="Ticket promedio" value={soles(data.kpis.avgTicket)} hint="últimos 30 días" />
            <Kpi label="Pagos por verificar" value={String(data.alerts.pendingPayments)} />
          </div>

          <Alerts alerts={data.alerts} />

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">Top ventas (7 días)</h2>
            <TopProducts items={data.topProducts} />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaSuffix = "",
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
  hint?: string;
}) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {delta != null && (
        <p className={`text-xs ${up ? "text-emerald-600" : down ? "text-red-600" : "text-slate-400"}`}>
          {up ? "▲" : down ? "▼" : "•"} {Math.abs(delta)}
          {deltaSuffix} vs ayer
        </p>
      )}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Alerts({
  alerts,
}: {
  alerts: { pendingPayments: number; abandonedCarts: number; lowStock: number; newReturns: number };
}) {
  const rows = [
    {
      icon: CreditCard,
      show: alerts.pendingPayments > 0,
      text: `${alerts.pendingPayments} pagos Yape pendientes de verificar`,
      href: "/payments",
      cta: "Ver pagos",
    },
    {
      icon: ShoppingCart,
      show: alerts.abandonedCarts > 0,
      text: `${alerts.abandonedCarts} carritos abandonados (>24h)`,
      href: "/reports",
      cta: "Ver reportes",
    },
    {
      icon: PackageX,
      show: alerts.lowStock > 0,
      text: `${alerts.lowStock} productos con stock bajo (< 3 und)`,
      href: "/inventory",
      cta: "Ver inventario",
    },
    {
      icon: Undo2,
      show: alerts.newReturns > 0,
      text: `${alerts.newReturns} solicitudes de devolución nuevas`,
      href: "/returns",
      cta: "Ver devoluciones",
    },
  ].filter((r) => r.show);

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">⚠ Alertas</h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
          Sin alertas. Todo al día.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.href} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <r.icon size={15} className="text-slate-400" /> {r.text}
              </span>
              <Link href={r.href} className="font-medium text-slate-900 hover:underline">
                {r.cta} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopProducts({ items }: { items: TopProduct[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
        Sin ventas en el período.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((p, i) => (
        <li key={p.productName} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-slate-700">
            {i + 1}. {p.productName}
          </span>
          <span className="text-slate-500">
            {p.quantity} und · {soles(p.revenue)}
          </span>
        </li>
      ))}
    </ol>
  );
}
