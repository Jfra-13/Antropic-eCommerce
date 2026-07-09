import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import {
  useListShipments,
  useAdvanceFulfillment,
  getListShipmentsQueryKey,
  type ShipmentItem,
} from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";

type Method = "delivery" | "recojo";
type FulfillmentStatus = ShipmentItem["fulfillmentStatus"];

// Columns per delivery method (requerimientos §6.4). The from-state implies the track, so the
// two methods never share columns.
const COLUMNS: Record<Method, { key: FulfillmentStatus; title: string }[]> = {
  delivery: [
    { key: "en_preparacion", title: "En preparación" },
    { key: "enviado", title: "Enviados" },
    { key: "entregado", title: "Entregados" },
  ],
  recojo: [
    { key: "recojo_pendiente", title: "Recojo pendiente" },
    { key: "recogido", title: "Recogidos" },
  ],
};

// Forward move offered on each card. Terminal states (entregado/recogido) have none.
const NEXT: Partial<Record<FulfillmentStatus, { to: FulfillmentStatus; label: string }>> = {
  en_preparacion: { to: "enviado", label: "Marcar enviado" },
  enviado: { to: "entregado", label: "Marcar entregado" },
  recojo_pendiente: { to: "recogido", label: "Marcar recogido" },
};

export default function Shipments() {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<Method>("delivery");
  // ponytail: one page of up to 100 covers a local store's active board; add pagination if the
  // delivered/recogido columns ever outgrow it (they accumulate).
  const params = { deliveryMethod: method, page: 1, limit: 100 };
  const { data, isLoading, isError, error, refetch, isFetching } = useListShipments(params);

  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  const advance = useAdvanceFulfillment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey(params) }),
      onError: (e, vars) => setActionError({ id: vars.id, message: errorMessage(e) }),
    },
  });

  const columns = COLUMNS[method];
  const byStatus = (status: FulfillmentStatus) =>
    (data?.items ?? []).filter((i) => i.fulfillmentStatus === status);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Envíos / Logística</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total} en curso` : "Cargando…"}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-slate-300 overflow-hidden text-sm">
            {(["delivery", "recojo"] as Method[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-3 py-1.5 capitalize ${
                  method === m ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando tablero…</p>}
      {isError && (
        <p className="text-sm text-red-600">No se pudo cargar el tablero: {errorMessage(error)}</p>
      )}

      {data && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((col) => {
            const cards = byStatus(col.key);
            return (
              <div key={col.key} className="rounded-lg bg-slate-50 border border-slate-200">
                <div className="px-3 py-2 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 flex justify-between">
                  <span>{col.title}</span>
                  <span>{cards.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-16">
                  {cards.map((item) => {
                    const next = NEXT[item.fulfillmentStatus];
                    const busy = advance.isPending && advance.variables?.id === item.id;
                    return (
                      <div key={item.id} className="rounded-md bg-white border border-slate-200 p-3 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">#{item.orderNumber}</span>
                          <span className="text-xs text-slate-400">{soles(item.total)}</span>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{item.customerEmail}</div>
                        {item.shippingAddress && (
                          <div className="text-xs text-slate-400 truncate">{item.shippingAddress}</div>
                        )}
                        {next && (
                          <button
                            onClick={() => {
                              setActionError(null);
                              advance.mutate({ id: item.id, data: { to: next.to } });
                            }}
                            disabled={busy}
                            className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {next.label} <ArrowRight size={12} />
                          </button>
                        )}
                        {actionError?.id === item.id && (
                          <div className="mt-1 text-xs text-red-600">{actionError.message}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
