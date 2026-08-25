import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle, Send, Clock } from "lucide-react";
import {
  useGetOpsSnapshot,
  useListNotificationDeliveries,
  useRetryNotificationDelivery,
  getListNotificationDeliveriesQueryKey,
  getGetOpsSnapshotQueryKey,
  type NotificationDelivery,
  type ListNotificationDeliveriesStatus,
} from "@workspace/api-client-react";
import { errorMessage } from "@/lib/format";

// Operaciones (auditoría §5, §8.3).
//
// The screen that answers "is anything stuck right now". Before it existed, the answer lived in
// the server's log output, which means nobody in the store could reach it: "el correo de la
// constancia nunca llegó" had no way to be checked, let alone fixed.
//
// It is deliberately separate from the Dashboard. That one is about sales and is loaded by
// every employee on every visit; this one runs heavier aggregate queries and is read when
// somebody is actually looking into a problem.

const KIND_LABELS: Record<string, string> = {
  payment_approved: "Pago aprobado",
  proof_received: "Constancia recibida",
  admin_new_proof: "Aviso: constancia nueva",
  admin_new_return: "Aviso: devolución nueva",
  admin_new_complaint: "Aviso: reclamo nuevo",
  complaint_filed: "Constancia de reclamo",
  complaint_answered: "Respuesta a reclamo",
  stock_available: "Aviso de reposición",
  fulfillment_en_preparacion: "Pedido en preparación",
  fulfillment_enviado: "Pedido enviado",
  fulfillment_entregado: "Pedido entregado",
  fulfillment_recojo_pendiente: "Listo para recojo",
  fulfillment_recogido: "Pedido recogido",
  fulfillment_cancelado: "Pedido cancelado",
};

const STATUS_FILTERS: { value: ListNotificationDeliveriesStatus | "todos"; label: string }[] = [
  { value: "fallido", label: "Fallidos" },
  { value: "pendiente", label: "En cola" },
  { value: "enviado", label: "Enviados" },
  { value: "todos", label: "Todos" },
];

function formatDateTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  }).format(d);
}

export default function Operations() {
  const [status, setStatus] = useState<ListNotificationDeliveriesStatus | "todos">("fallido");
  const params = status === "todos" ? {} : { status };

  const ops = useGetOpsSnapshot();
  const deliveries = useListNotificationDeliveries(params);
  const queryClient = useQueryClient();

  const retry = useRetryNotificationDelivery({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListNotificationDeliveriesQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetOpsSnapshotQueryKey() });
      },
    },
  });

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Operaciones</h1>
          <p className="text-sm text-slate-500">
            Cómo va la cola de verificación, los pagos y el envío de correos.
          </p>
        </div>
        <button
          onClick={() => {
            void ops.refetch();
            void deliveries.refetch();
          }}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <RefreshCw size={14} className={ops.isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {ops.isError && <p className="text-sm text-red-600">Error: {errorMessage(ops.error)}</p>}

      {ops.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat
              label="Constancias por verificar"
              value={String(ops.data.verificationQueue.pending)}
              hint={
                ops.data.verificationQueue.oldestWaitingHours === null
                  ? "nada en espera"
                  : `la más antigua: ${ops.data.verificationQueue.oldestWaitingHours} h`
              }
              // 24 h is not a legal threshold, it is a customer-patience one: a constancia
              // waiting more than a day is where "¿ya recibieron mi pago?" comes from.
              alarming={(ops.data.verificationQueue.oldestWaitingHours ?? 0) > 24}
            />
            <Stat
              label="Tasa de aprobación"
              value={
                ops.data.payments7d.approvalRatePct === null
                  ? "—"
                  : `${ops.data.payments7d.approvalRatePct}%`
              }
              hint={`${ops.data.payments7d.approved} aprobados · ${ops.data.payments7d.rejected} rechazados (7 d)`}
            />
            <Stat
              label="Pedidos vencidos"
              value={String(ops.data.payments7d.expired)}
              hint="sin pago en 7 días"
            />
            <Stat
              label="Correos sin salir"
              value={String(ops.data.notifications.pending + ops.data.notifications.failed)}
              hint={
                ops.data.notifications.oldestPendingMinutes === null
                  ? `${ops.data.notifications.failed} fallidos`
                  : `en cola desde hace ${ops.data.notifications.oldestPendingMinutes} min`
              }
              // A few pending rows are normal — they are seconds old. A queue that has not
              // moved in 15 minutes means delivery has stopped.
              alarming={
                ops.data.notifications.failed > 0 ||
                (ops.data.notifications.oldestPendingMinutes ?? 0) > 15
              }
            />
          </div>

          {ops.data.database.poolWaiting > 0 && (
            <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={14} />
              Hay {ops.data.database.poolWaiting} consultas esperando conexión a la base de datos
              en esta instancia. Si se mantiene, el pool se está quedando corto.
            </p>
          )}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-slate-400">Envío de correos</h2>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className={`rounded px-2.5 py-1 text-xs ${
                  status === f.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {deliveries.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {deliveries.isError && (
          <p className="text-sm text-red-600">Error: {errorMessage(deliveries.error)}</p>
        )}
        {deliveries.data?.items.length === 0 && (
          <p className="text-sm text-slate-500">No hay envíos con este estado.</p>
        )}

        {deliveries.data && deliveries.data.items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Mensaje</th>
                  <th className="px-3 py-2 font-medium">Destinatario</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Cuándo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.data.items.map((item) => (
                  <DeliveryRow
                    key={item.id}
                    item={item}
                    onRetry={() => retry.mutate({ id: item.id })}
                    retrying={retry.isPending && retry.variables?.id === item.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {retry.isError && (
          <p className="mt-2 text-sm text-red-600">
            No se pudo reintentar: {errorMessage(retry.error)}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  alarming,
}: {
  label: string;
  value: string;
  hint?: string;
  alarming?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        alarming ? "border-red-200 bg-red-50" : "border-slate-200"
      }`}
    >
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alarming ? "text-red-700" : "text-slate-900"}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function DeliveryRow({
  item,
  onRetry,
  retrying,
}: {
  item: NotificationDelivery;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <div className="font-medium text-slate-900">{KIND_LABELS[item.kind] ?? item.kind}</div>
        <div className="text-xs text-slate-500">{item.subject}</div>
      </td>
      <td className="px-3 py-2 text-slate-600">{item.recipient}</td>
      <td className="px-3 py-2">
        {item.status === "enviado" && <span className="text-emerald-600">Enviado</span>}
        {item.status === "pendiente" && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <Clock size={12} /> En cola · intento {item.attempts}
          </span>
        )}
        {item.status === "fallido" && (
          <span className="inline-flex items-center gap-1 text-red-600">
            <AlertTriangle size={12} /> Falló
          </span>
        )}
        {item.lastError && (
          <div className="mt-0.5 max-w-xs truncate text-xs text-slate-400" title={item.lastError}>
            {item.lastError}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {item.sentAt ? formatDateTime(item.sentAt) : formatDateTime(item.createdAt)}
      </td>
      <td className="px-3 py-2 text-right">
        {/* Only a failed message can be requeued: resending a delivered one would reach the
            customer as a duplicate, not as a retry. The API refuses it either way. */}
        {item.status === "fallido" && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Send size={12} /> {retrying ? "Enviando…" : "Reintentar"}
          </button>
        )}
      </td>
    </tr>
  );
}
