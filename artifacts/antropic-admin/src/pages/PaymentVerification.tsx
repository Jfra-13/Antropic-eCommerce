import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, ExternalLink, RefreshCw } from "lucide-react";
import {
  useListPaymentVerificationQueue,
  useApproveOrderPayment,
  useRejectOrderPayment,
  getListPaymentVerificationQueueQueryKey,
  type PaymentVerificationItem,
} from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";

// Payment verification queue (requerimientos §6.3). The employee sees each pending constancia,
// opens the proof, and approves or rejects. Approval decrements stock server-side in one
// transaction — a failure here (e.g. insufficient stock) is surfaced inline, never silent.
export default function PaymentVerification() {
  const queryClient = useQueryClient();
  const params = { page: 1, limit: 20 };
  const { data, isLoading, isError, error, refetch, isFetching } =
    useListPaymentVerificationQueue(params);

  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListPaymentVerificationQueueQueryKey(params),
    });

  const approve = useApproveOrderPayment({
    mutation: {
      onSuccess: invalidate,
      onError: (e, vars) => setActionError({ id: vars.id, message: errorMessage(e) }),
    },
  });
  const reject = useRejectOrderPayment({
    mutation: {
      onSuccess: invalidate,
      onError: (e, vars) => setActionError({ id: vars.id, message: errorMessage(e) }),
    },
  });

  const busyId =
    approve.isPending ? approve.variables?.id : reject.isPending ? reject.variables?.id : undefined;

  function act(kind: "approve" | "reject", id: string) {
    setActionError(null);
    (kind === "approve" ? approve : reject).mutate({ id });
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Verificación de pagos</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} pendiente${data.total === 1 ? "" : "s"}` : "Cargando…"}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando cola…</p>}
      {isError && (
        <p className="text-sm text-red-600">No se pudo cargar la cola: {errorMessage(error)}</p>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No hay pagos pendientes de verificar.
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Orden</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 font-medium">Constancia</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item: PaymentVerificationItem) => {
                const rowBusy = busyId === item.id;
                const mismatch =
                  item.amountReported != null && item.amountReported !== item.total;
                return (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">#{item.orderNumber}</div>
                      <div className="text-xs text-slate-400 capitalize">{item.deliveryMethod}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.customerName && (
                        <div className="font-medium text-slate-900">{item.customerName}</div>
                      )}
                      <div>{item.customerEmail}</div>
                      {item.customerPhone && (
                        <div className="text-xs text-slate-400">{item.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{soles(item.total)}</div>
                      {item.amountReported != null && (
                        <div className={`text-xs ${mismatch ? "text-amber-600" : "text-slate-400"}`}>
                          reportado: {soles(item.amountReported)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {item.referenceCode}
                    </td>
                    <td className="px-4 py-3">
                      {item.proofUrl ? (
                        <a
                          href={item.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
                        >
                          Ver <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => act("approve", item.id)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check size={13} /> Aprobar
                        </button>
                        <button
                          onClick={() => act("reject", item.id)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <X size={13} /> Rechazar
                        </button>
                      </div>
                      {actionError?.id === item.id && (
                        <div className="mt-1 text-right text-xs text-red-600">
                          {actionError.message}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
