import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Plus, Ban, CheckCircle2, ShoppingBag } from "lucide-react";
import {
  useListUsers,
  useCreateEmployee,
  useUpdateUser,
  getListUsersQueryKey,
  type AdminUser,
  type ListUsersRole,
} from "@workspace/api-client-react";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/format";
import { Pagination } from "@/components/Pagination";

const ROLE_LABEL: Record<AdminUser["role"], string> = {
  customer: "Cliente",
  employee: "Empleado",
  admin: "Administrador",
};

export default function Users() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const currentUserId = session?.user.id ?? "";
  const [tab, setTabState] = useState<ListUsersRole>("customer");
  const [q, setQState] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  // Changing tab or search resets to the first page.
  const setTab = (t: ListUsersRole) => { setTabState(t); setPage(1); };
  const setQ = (value: string) => { setQState(value); setPage(1); };

  const params = { role: tab, q: q || undefined, page, limit: 50 };
  const { data, isLoading, isError, error, refetch, isFetching } = useListUsers(params);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const tabClass = (t: ListUsersRole) =>
    `px-3 py-1.5 text-sm rounded-md ${
      tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Usuarios</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total}` : "Cargando…"}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nombre o correo…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
          {tab === "employee" && (
            <button
              onClick={() => setCreating((c) => !c)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus size={14} /> Crear empleado
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        <button className={tabClass("customer")} onClick={() => setTab("customer")}>
          Clientes
        </button>
        <button className={tabClass("employee")} onClick={() => setTab("employee")}>
          Empleados
        </button>
      </div>

      {creating && tab === "employee" && (
        <CreateEmployeeForm
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
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUserId}
                  onChanged={invalidate}
                />
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Sin usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <Pagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const update = useUpdateUser({ mutation: { onSuccess: onChanged } });
  const isStaff = user.role !== "customer";

  return (
    <tr className={user.blocked ? "opacity-60" : ""}>
      <td className="px-4 py-3 font-medium">{user.fullName ?? "—"}</td>
      <td className="px-4 py-3 text-slate-600">{user.email}</td>
      <td className="px-4 py-3">
        {isStaff && !isSelf ? (
          <select
            value={user.role}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate({ id: user.id, data: { role: e.target.value as AdminUser["role"] } })
            }
            className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="employee">Empleado</option>
            <option value="admin">Administrador</option>
          </select>
        ) : (
          ROLE_LABEL[user.role]
        )}
      </td>
      <td className="px-4 py-3">
        {user.blocked ? (
          <span className="text-red-600 font-medium">Bloqueado</span>
        ) : (
          <span className="text-emerald-600">Activo</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          {user.role === "customer" && (
            <Link
              href={`/orders?userId=${user.id}`}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
              title="Ver historial de pedidos"
            >
              <ShoppingBag size={15} /> Ver pedidos
            </Link>
          )}
          {isSelf ? (
            <span className="text-xs text-slate-400">Tú</span>
          ) : user.blocked ? (
            <button
              onClick={() => update.mutate({ id: user.id, data: { blocked: false } })}
              disabled={update.isPending}
              className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              <CheckCircle2 size={15} /> Desbloquear
            </button>
          ) : (
            <button
              onClick={() => update.mutate({ id: user.id, data: { blocked: true } })}
              disabled={update.isPending}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-red-600 disabled:opacity-50"
            >
              <Ban size={15} /> Bloquear
            </button>
          )}
        </div>
        {update.isError && (
          <div className="mt-1 text-right text-xs text-red-600">{errorMessage(update.error)}</div>
        )}
      </td>
    </tr>
  );
}

function CreateEmployeeForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const create = useCreateEmployee({ mutation: { onSuccess: onDone } });

  const canSubmit = email.trim().includes("@");

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Correo" value={email} onChange={setEmail} type="email" />
        <Field label="Nombre" value={fullName} onChange={setFullName} />
        <Field label="WhatsApp / Teléfono" value={phone} onChange={setPhone} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() =>
            create.mutate({
              data: {
                email: email.trim(),
                fullName: fullName.trim() || null,
                phone: phone.trim() || null,
              },
            })
          }
          disabled={!canSubmit || create.isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {create.isPending ? "Creando…" : "Crear empleado"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        {create.isError && (
          <span className="text-sm text-red-600">{errorMessage(create.error)}</span>
        )}
        <span className="text-xs text-slate-400">Recibe acceso por magic link / Google.</span>
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
