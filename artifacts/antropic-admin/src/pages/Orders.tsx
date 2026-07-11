import { useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { RefreshCw, X } from "lucide-react";
import {
  useListAdminOrders,
  useGetAdminOrder,
  type AdminOrderListItem,
  type ListAdminOrdersParams,
} from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";
import { Pagination } from "@/components/Pagination";

type PaymentStatus = AdminOrderListItem["paymentStatus"];
type FulfillmentStatus = NonNullable<AdminOrderListItem["fulfillmentStatus"]>;

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pendiente_pago: "Pendiente de pago",
  en_verificacion: "En verificación",
  pagado: "Pagado",
  rechazado: "Rechazado",
};

const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  en_preparacion: "En preparación",
  enviado: "Enviado",
  entregado: "Entregado",
  recojo_pendiente: "Recojo pendiente",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  pendiente_pago: "bg-amber-50 text-amber-700",
  en_verificacion: "bg-blue-50 text-blue-700",
  pagado: "bg-emerald-50 text-emerald-700",
  rechazado: "bg-red-50 text-red-700",
};

const LIMIT = 20;

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// The URL is the single source of truth for filters — Users ("Ver pedidos") and
// Shipments ("Ver historial") deep-link here with pre-applied filters.
export default function Orders() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const q = params.get("q") ?? "";
  const paymentStatus = (params.get("paymentStatus") as PaymentStatus | null) ?? undefined;
  const fulfillmentStatus =
    (params.get("fulfillmentStatus") as FulfillmentStatus | null) ?? undefined;
  const userId = params.get("userId") ?? undefined;
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);

  // Local input state so typing doesn't refetch on every keystroke; Enter/blur applies.
  const [qInput, setQInput] = useState(q);
  const [selected, setSelected] = useState<string | null>(null);

  const listParams: ListAdminOrdersParams = {
    q: q || undefined,
    paymentStatus,
    fulfillmentStatus,
    userId,
    from,
    to,
    page,
    limit: LIMIT,
  };
  const { data, isLoading, isError, error, refetch, isFetching } = useListAdminOrders(listParams);

  // Filter changes reset the page; page changes keep the rest.
  const setParam = (key: string, value: string | null, opts?: { keepPage?: boolean }) => {
    const next = new URLSearchParams(searchString);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (!opts?.keepPage) next.delete("page");
    const s = next.toString();
    setLocation(s ? `/orders?${s}` : "/orders", { replace: true });
  };

  const select = "rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pedidos</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total} pedidos` : "Cargando…"}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onBlur={() => setParam("q", qInput.trim())}
          onKeyDown={(e) => e.key === "Enter" && setParam("q", qInput.trim())}
          placeholder="Buscar por número, nombre o correo…"
          className={`${select} w-64`}
        />
        <select
          value={paymentStatus ?? ""}
          onChange={(e) => setParam("paymentStatus", e.target.value)}
          className={select}
        >
          <option value="">Pago: todos</option>
          {Object.entries(PAYMENT_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select
          value={fulfillmentStatus ?? ""}
          onChange={(e) => setParam("fulfillmentStatus", e.target.value)}
          className={select}
        >
          <option value="">Entrega: todos</option>
          {Object.entries(FULFILLMENT_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <input type="date" value={from ?? ""} onChange={(e) => setParam("from", e.target.value)} className={select} />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" value={to ?? ""} onChange={(e) => setParam("to", e.target.value)} className={select} />
        {userId && (
          <button
            onClick={() => setParam("userId", null)}
            className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-300"
          >
            Cliente filtrado <X size={12} />
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Entrega</th>
                  <th className="px-4 py-3 font-medium">Pago</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o.id)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium">{o.referenceCode}</td>
                    <td className="px-4 py-3 text-slate-600">{fecha(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{o.customerName ?? "—"}</div>
                      <div className="text-xs text-slate-500">{o.customerEmail}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">{o.deliveryMethod}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_BADGE[o.paymentStatus]}`}>
                        {PAYMENT_LABEL[o.paymentStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.fulfillmentStatus ? FULFILLMENT_LABEL[o.fulfillmentStatus] : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{soles(o.total)}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                      Sin pedidos con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            onPageChange={(p) => setParam("page", String(p), { keepPage: true })}
          />
        </>
      )}

      {selected && <OrderDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useGetAdminOrder(id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {data ? `Pedido ${data.referenceCode}` : "Pedido"}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

        {data && (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
              <DetailRow label="Fecha" value={fecha(data.createdAt)} />
              <DetailRow label="Cliente" value={data.customerName ?? "—"} />
              <DetailRow label="Correo" value={data.customerEmail} />
              {data.customerPhone && <DetailRow label="Teléfono" value={data.customerPhone} />}
              <DetailRow label="Pago" value={PAYMENT_LABEL[data.paymentStatus]} />
              <DetailRow
                label="Estado de entrega"
                value={data.fulfillmentStatus ? FULFILLMENT_LABEL[data.fulfillmentStatus] : "—"}
              />
              <DetailRow
                label="Entrega"
                value={
                  data.deliveryMethod === "delivery"
                    ? `Delivery — ${data.shippingAddress ?? "sin dirección"}`
                    : `Recojo — ${data.pickupPointName ?? "punto eliminado"}`
                }
              />
              {data.couponCode && <DetailRow label="Cupón" value={data.couponCode} />}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    <th className="px-3 py-2 font-medium text-center">Cant.</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{item.productName}</div>
                        {item.variantLabel && (
                          <div className="text-xs text-slate-500">{item.variantLabel}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{soles(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
              <DetailRow label="Subtotal" value={soles(data.subtotal)} />
              <DetailRow label="Envío" value={soles(data.shippingCost)} />
              {data.discountAmount !== "0.00" && (
                <DetailRow label="Descuento" value={`- ${soles(data.discountAmount)}`} />
              )}
              <DetailRow label="Total" value={<strong>{soles(data.total)}</strong>} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
