import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import {
  useListComplaints,
  useRespondComplaint,
  getListComplaintsQueryKey,
  type AdminComplaint,
  type ListComplaintsStatus,
  type ListComplaintsType,
} from "@workspace/api-client-react";
import { errorMessage } from "@/lib/format";

// Libro de Reclamaciones board.
//
// This screen exists because the system being correct is not a defence: the fine comes from
// nobody answering within 30 calendar days. So the deadline, not the arrival date, is what the
// list is built around — open files first, soonest deadline at the top, overdue ones flagged.

const STATUSES: { value: ListComplaintsStatus; label: string; className: string }[] = [
  { value: "pendiente", label: "Pendiente", className: "text-amber-600" },
  { value: "en_proceso", label: "En proceso", className: "text-sky-600" },
  { value: "resuelto", label: "Resuelto", className: "text-emerald-600" },
  { value: "cerrado", label: "Cerrado", className: "text-slate-400" },
];

const DOCUMENT_LABELS: Record<string, string> = {
  dni: "DNI",
  ce: "CE",
  pasaporte: "Pasaporte",
  ruc: "RUC",
};

function statusMeta(status: string) {
  return STATUSES.find((s) => s.value === status) ?? { label: status, className: "text-slate-600" };
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(d);
}

// The deadline column. Answered files are done, so their countdown is irrelevant and would
// only add noise; everything still open shows how much runway is left, in red once it is gone.
function Deadline({ complaint }: { complaint: AdminComplaint }) {
  const settled = complaint.status === "resuelto" || complaint.status === "cerrado";
  if (settled) {
    return <span className="text-slate-400">{formatDate(complaint.dueAt)}</span>;
  }
  const days = complaint.daysRemaining;
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-red-600">
        <AlertTriangle size={13} /> Vencido hace {Math.abs(days)} d
      </span>
    );
  }
  const tone = days <= 5 ? "text-red-600" : days <= 10 ? "text-amber-600" : "text-slate-600";
  return (
    <span className={`font-medium ${tone}`}>
      {days} d · {formatDate(complaint.dueAt)}
    </span>
  );
}

export default function Complaints() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ListComplaintsStatus | "">("");
  const [type, setType] = useState<ListComplaintsType | "">("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useListComplaints({
    status: status || undefined,
    type: type || undefined,
    page: 1,
    limit: 50,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListComplaintsQueryKey() });

  const overdue = data?.items.filter(
    (c) => c.daysRemaining < 0 && c.status !== "resuelto" && c.status !== "cerrado",
  ).length;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Libro de Reclamaciones</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} registros` : "Cargando…"}
            {overdue ? ` · ${overdue} fuera de plazo` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ListComplaintsType | "")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">Reclamos y quejas</option>
            <option value="reclamo">Solo reclamos</option>
            <option value="queja">Solo quejas</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ListComplaintsStatus | "")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
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
                <th className="w-8 px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Consumidor</th>
                <th className="px-4 py-3 font-medium">Plazo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((c) => (
                <ComplaintRow
                  key={c.id}
                  complaint={c}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded((id) => (id === c.id ? null : c.id))}
                  onChanged={invalidate}
                />
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Sin registros.
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

function ComplaintRow({
  complaint,
  expanded,
  onToggle,
  onChanged,
}: {
  complaint: AdminComplaint;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [response, setResponse] = useState(complaint.response ?? "");
  const [status, setStatus] = useState<AdminComplaint["status"]>(complaint.status);
  const respond = useRespondComplaint({ mutation: { onSuccess: onChanged } });
  const meta = statusMeta(complaint.status);

  return (
    <>
      <tr>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-slate-400 hover:text-slate-700">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3 font-mono font-medium">{complaint.code}</td>
        <td className="px-4 py-3 capitalize text-slate-600">{complaint.type}</td>
        <td className="px-4 py-3">{complaint.consumerName}</td>
        <td className="px-4 py-3"><Deadline complaint={complaint} /></td>
        <td className={`px-4 py-3 font-medium ${meta.className}`}>{meta.label}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-6 py-4">
            <div className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <div>
                  <span className="text-slate-500">Consumidor:</span> {complaint.consumerName} ·{" "}
                  {DOCUMENT_LABELS[complaint.consumerDocumentType] ?? complaint.consumerDocumentType}{" "}
                  {complaint.consumerDocumentNumber} · {complaint.consumerEmail}
                  {complaint.consumerPhone && <> · {complaint.consumerPhone}</>}
                </div>
                {complaint.consumerAddress && (
                  <div><span className="text-slate-500">Domicilio:</span> {complaint.consumerAddress}</div>
                )}
                {complaint.isMinor && (
                  <div className="text-amber-700">
                    Menor de edad · Tutor: {complaint.guardianName ?? "—"}
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Bien:</span>{" "}
                  <span className="capitalize">{complaint.itemType}</span> —{" "}
                  {complaint.itemDescription}
                  {complaint.itemAmount && <> · S/ {complaint.itemAmount}</>}
                  {complaint.orderNumber && <> · pedido #{complaint.orderNumber}</>}
                </div>
                <div><span className="text-slate-500">Detalle:</span> {complaint.detail}</div>
                <div><span className="text-slate-500">Pedido del consumidor:</span> {complaint.request}</div>
                <div className="text-slate-500">
                  Registrado el {formatDate(complaint.createdAt)} · vence el {formatDate(complaint.dueAt)}
                  {complaint.respondedAt && <> · respondido el {formatDate(complaint.respondedAt)}</>}
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-slate-500" htmlFor={`resp-${complaint.id}`}>
                  Acciones adoptadas por el proveedor
                </label>
                <textarea
                  id={`resp-${complaint.id}`}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={3}
                  placeholder="Se envía por correo al consumidor y queda en el registro."
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
                <div className="flex items-center gap-3">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AdminComplaint["status"])}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    disabled={respond.isPending}
                    onClick={() =>
                      respond.mutate({
                        id: complaint.id,
                        // Only send a response when there is one: a bare status change
                        // (pendiente -> en_proceso) is not an answer and must not be
                        // recorded as one.
                        data: {
                          status,
                          response: response.trim() === "" ? null : response.trim(),
                        },
                      })
                    }
                    className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {respond.isPending ? "Guardando…" : "Guardar"}
                  </button>
                  {respond.isError && (
                    <span className="text-xs text-red-600">{errorMessage(respond.error)}</span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
