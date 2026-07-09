import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, MessageCircle, ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import {
  useListReturns,
  useUpdateReturnStatus,
  getListReturnsQueryKey,
  type AdminReturn,
  type ListReturnsStatus,
} from "@workspace/api-client-react";
import { errorMessage } from "@/lib/format";

const STATUSES: { value: ListReturnsStatus; label: string; className: string }[] = [
  { value: "nueva", label: "Nueva", className: "text-sky-600" },
  { value: "en_proceso", label: "En proceso", className: "text-amber-600" },
  { value: "resuelta", label: "Resuelta", className: "text-emerald-600" },
  { value: "cerrada", label: "Cerrada", className: "text-slate-400" },
];

function statusMeta(status: string) {
  return STATUSES.find((s) => s.value === status) ?? { label: status, className: "text-slate-600" };
}

// wa.me needs a bare international number (digits only).
function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export default function Returns() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ListReturnsStatus | "">("");
  const params = { status: status || undefined, page: 1, limit: 50 };
  const { data, isLoading, isError, error, refetch, isFetching } = useListReturns(params);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListReturnsQueryKey() });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Devoluciones</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total} tickets` : "Cargando…"}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ListReturnsStatus | "")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((t) => (
                <ReturnRow
                  key={t.id}
                  ticket={t}
                  expanded={expanded === t.id}
                  onToggle={() => setExpanded((id) => (id === t.id ? null : t.id))}
                  onChanged={invalidate}
                />
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Sin devoluciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReturnRow({
  ticket,
  expanded,
  onToggle,
  onChanged,
}: {
  ticket: AdminReturn;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const update = useUpdateReturnStatus({ mutation: { onSuccess: onChanged } });
  const meta = statusMeta(ticket.status);
  const wa = whatsappHref(ticket.customerPhone);

  return (
    <>
      <tr>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-slate-400 hover:text-slate-700">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3 font-mono font-medium">#DV-{ticket.ticketNumber}</td>
        <td className="px-4 py-3 font-mono text-slate-600">#{ticket.orderNumber}</td>
        <td className="px-4 py-3">{ticket.customerName ?? ticket.customerEmail}</td>
        <td className="px-4 py-3 text-slate-600 truncate max-w-[16rem]">{ticket.reason ?? "—"}</td>
        <td className={`px-4 py-3 font-medium ${meta.className}`}>{meta.label}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-6 py-4">
            <div className="grid gap-2 text-sm">
              <div>
                <span className="text-slate-500">Cliente:</span>{" "}
                {ticket.customerName ?? "—"} · {ticket.customerEmail}
                {ticket.customerPhone && <> · {ticket.customerPhone}</>}
              </div>
              <div>
                <span className="text-slate-500">Motivo:</span> {ticket.reason ?? "—"}
              </div>
              <div className="text-slate-600">
                Talla actual: <strong>{ticket.currentSize ?? "—"}</strong> · Deseada:{" "}
                <strong>{ticket.desiredSize ?? "—"}</strong>
                {ticket.photoPath && (
                  <span className="ml-2 inline-flex items-center gap-1 text-slate-500">
                    <Paperclip size={13} /> foto adjunta
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
                <label className="text-xs text-slate-500">Estado</label>
                <select
                  value={ticket.status}
                  disabled={update.isPending}
                  onChange={(e) =>
                    update.mutate({
                      id: ticket.id,
                      data: { status: e.target.value as AdminReturn["status"] },
                    })
                  }
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {update.isError && (
                  <span className="text-xs text-red-600">{errorMessage(update.error)}</span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
