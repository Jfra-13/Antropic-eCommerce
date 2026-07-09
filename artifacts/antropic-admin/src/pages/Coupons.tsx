import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import {
  useListCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  getListCouponsQueryKey,
  type Coupon,
} from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";

// Date <-> <input type="date"> (yyyy-mm-dd). The API sends/receives dates as ISO strings
// (api-client keeps them as strings; the server coerces). ponytail: if the business needs
// Lima-timezone day boundaries instead of UTC midnight, convert here.
function toDateInput(d: string | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
function fromDateInput(s: string): string | null {
  return s || null;
}

function statusLabel(c: Coupon): { text: string; className: string } {
  const now = new Date();
  if (!c.active) return { text: "Inactivo", className: "text-slate-400" };
  if (c.startsAt && now < new Date(c.startsAt))
    return { text: "Programado", className: "text-sky-600" };
  if (c.endsAt && now > new Date(c.endsAt)) return { text: "Expirado", className: "text-slate-400" };
  if (c.maxUses !== null && c.usedCount >= c.maxUses)
    return { text: "Agotado", className: "text-amber-600" };
  return { text: "Activo", className: "text-emerald-600" };
}

function valueLabel(c: Pick<Coupon, "type" | "value">): string {
  return c.type === "percent" ? `${c.value} %` : soles(c.value);
}

export default function Coupons() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const params = { q: q || undefined, page: 1, limit: 50 };
  const { data, isLoading, isError, error, refetch, isFetching } = useListCoupons(params);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCouponsQueryKey() });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Cupones</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total} cupones` : "Cargando…"}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => {
              setCreating((c) => !c);
              setEditing(null);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={14} /> Crear cupón
          </button>
        </div>
      </div>

      {creating && (
        <CouponForm
          onDone={() => {
            setCreating(false);
            invalidate();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Vigencia</th>
                <th className="px-4 py-3 font-medium">Usos</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((c) => (
                <CouponRow
                  key={c.id}
                  coupon={c}
                  editing={editing === c.id}
                  onEdit={() => {
                    setEditing((id) => (id === c.id ? null : c.id));
                    setCreating(false);
                  }}
                  onChanged={invalidate}
                />
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Sin cupones.
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

function CouponRow({
  coupon,
  editing,
  onEdit,
  onChanged,
}: {
  coupon: Coupon;
  editing: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const update = useUpdateCoupon({ mutation: { onSuccess: onChanged } });
  const del = useDeleteCoupon({ mutation: { onSuccess: onChanged } });
  const status = statusLabel(coupon);
  const vigencia =
    (coupon.startsAt ? new Date(coupon.startsAt).toLocaleDateString() : "—") +
    " → " +
    (coupon.endsAt ? new Date(coupon.endsAt).toLocaleDateString() : "—");

  return (
    <>
      <tr className={coupon.active ? "" : "opacity-60"}>
        <td className="px-4 py-3 font-mono font-medium">{coupon.code}</td>
        <td className="px-4 py-3 text-slate-600">
          {coupon.type === "percent" ? "Porcentaje" : "Monto fijo"}
        </td>
        <td className="px-4 py-3">{valueLabel(coupon)}</td>
        <td className="px-4 py-3 text-slate-600">{vigencia}</td>
        <td className="px-4 py-3">
          {coupon.usedCount}
          {coupon.maxUses !== null ? `/${coupon.maxUses}` : ""}
        </td>
        <td className={`px-4 py-3 font-medium ${status.className}`}>{status.text}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={coupon.active}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({ id: coupon.id, data: { active: e.target.checked } })
                }
              />
              Activo
            </label>
            <button
              onClick={onEdit}
              className="text-slate-500 hover:text-slate-900"
              title="Editar"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => {
                if (confirm(`¿Eliminar el cupón ${coupon.code}?`)) del.mutate({ id: coupon.id });
              }}
              disabled={del.isPending}
              className="text-slate-500 hover:text-red-600 disabled:opacity-50"
              title="Eliminar"
            >
              <Trash2 size={15} />
            </button>
          </div>
          {del.isError && (
            <div className="mt-1 text-right text-xs text-red-600">{errorMessage(del.error)}</div>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-6 py-4">
            <CouponForm coupon={coupon} onDone={onChanged} onCancel={onEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

function CouponForm({
  coupon,
  onDone,
  onCancel,
}: {
  coupon?: Coupon;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!coupon;
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<Coupon["type"]>(coupon?.type ?? "percent");
  const [value, setValue] = useState(coupon?.value ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(coupon?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(coupon?.endsAt ?? null));
  const [maxUses, setMaxUses] = useState(coupon?.maxUses != null ? String(coupon.maxUses) : "");
  const [minPurchase, setMinPurchase] = useState(coupon?.minPurchase ?? "0");

  const create = useCreateCoupon({ mutation: { onSuccess: onDone } });
  const update = useUpdateCoupon({ mutation: { onSuccess: onDone } });
  const mut = isEdit ? update : create;

  const canSubmit = code.trim() && value.trim();

  function submit() {
    const payload = {
      code: code.trim(),
      type,
      value: value.trim(),
      startsAt: fromDateInput(startsAt),
      endsAt: fromDateInput(endsAt),
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      minPurchase: minPurchase.trim() || "0",
    };
    if (isEdit) update.mutate({ id: coupon.id, data: payload });
    else create.mutate({ data: payload });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 mb-2">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Código" value={code} onChange={setCode} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Coupon["type"])}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed">Monto fijo (S/)</option>
          </select>
        </div>
        <Field
          label={type === "percent" ? "Valor (%)" : "Valor (S/)"}
          value={value}
          onChange={setValue}
        />
        <Field label="Desde" value={startsAt} onChange={setStartsAt} type="date" />
        <Field label="Hasta" value={endsAt} onChange={setEndsAt} type="date" />
        <Field label="Límite de usos" value={maxUses} onChange={setMaxUses} type="number" />
        <Field label="Mín. compra (S/)" value={minPurchase} onChange={setMinPurchase} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit || mut.isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {mut.isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cupón"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        {mut.isError && <span className="text-sm text-red-600">{errorMessage(mut.error)}</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
      />
    </div>
  );
}
