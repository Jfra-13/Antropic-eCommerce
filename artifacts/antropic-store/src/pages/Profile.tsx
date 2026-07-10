import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrders,
  getListOrdersQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useUpdateMe,
} from "@workspace/api-client-react";
import { useStore } from "../context/StoreContext";
import { formatPrice, priceToNumber } from "../lib/product";
import { orderStatusLabel } from "../lib/orders";
import { apiErrorMessage } from "../lib/errors";

const ORDERS_PARAMS = { page: 1, limit: 20 };

export default function Profile() {
  const { user, logout } = useStore();
  const [, setLocation] = useLocation();

  const orders = useListOrders(ORDERS_PARAMS, {
    query: { queryKey: getListOrdersQueryKey(ORDERS_PARAMS), enabled: !!user },
  });

  if (!user) {
    setLocation("/login");
    return null;
  }

  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4 md:px-6">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-80 flex flex-col gap-6">
          <div className="bg-white p-8 text-center shadow-sm border border-border flex flex-col items-center">
            <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center text-white font-serif text-3xl mb-4 shadow-inner">
              {initials}
            </div>
            <h2 className="font-serif text-2xl text-foreground">{user.name}</h2>
            <p className="font-sans text-muted-foreground mt-1">{user.email}</p>
          </div>

          <ProfileDataCard />

          <button
            onClick={handleLogout}
            className="w-full bg-white text-primary border-2 border-primary font-sans font-bold text-lg py-4 hover:bg-primary hover:text-white transition-colors shadow-sm"
          >
            Cerrar Sesión
          </button>
        </div>

        {/* Orders */}
        <div className="flex-1">
          <div className="bg-white p-6 md:p-8 shadow-sm border border-border">
            <h3 className="font-serif text-2xl text-foreground mb-6 flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>
              Mis Pedidos
            </h3>

            {orders.isLoading && (
              <p className="font-sans text-muted-foreground">Cargando tus pedidos…</p>
            )}

            {orders.isError && (
              <p className="font-sans text-sm text-destructive">
                No pudimos cargar tus pedidos. Inténtalo de nuevo.
              </p>
            )}

            {orders.data && orders.data.items.length === 0 && (
              <div className="bg-muted p-8 text-center border border-border border-dashed">
                <p className="font-sans text-muted-foreground text-lg mb-4">Aún no has realizado ninguna compra.</p>
                <Link href="/search" className="font-sans font-bold text-sm text-primary hover:underline">
                  Descubre la colección →
                </Link>
              </div>
            )}

            {orders.data && orders.data.items.length > 0 && (
              <div className="flex flex-col divide-y divide-border">
                {orders.data.items.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders/${o.id}`}
                    className="flex items-center justify-between py-4 group"
                  >
                    <div>
                      <p className="font-sans font-bold text-foreground group-hover:text-primary transition-colors">
                        Pedido #{o.orderNumber}
                      </p>
                      <p className="font-sans text-sm text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString()} · {orderStatusLabel(o)}
                      </p>
                    </div>
                    <span className="font-sans font-bold text-foreground">
                      {formatPrice(priceToNumber(o.total))}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Contact/shipping data behind the pencil: locked gray inputs by default, editable on
// demand, saved via PATCH /me (email is the login identity — never editable here).
function ProfileDataCard() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const save = useUpdateMe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setEditing(false);
      },
    },
  });

  const profile = me?.user;

  const startEditing = () => {
    setFullName(profile?.fullName ?? "");
    setPhone(profile?.phone ?? "");
    setAddress(profile?.shippingAddress ?? "");
    setEditing(true);
  };

  const submit = () => {
    save.mutate({
      data: {
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        shippingAddress: address.trim() || undefined,
      },
    });
  };

  return (
    <div className="bg-white p-6 shadow-sm border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-sans font-bold text-base uppercase tracking-wide text-foreground">
          Mis datos
        </h3>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Editar mis datos"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <ProfileField label="Correo" value={profile?.email ?? ""} locked />
        {editing ? (
          <>
            <EditableField label="Nombre completo" value={fullName} onChange={setFullName} placeholder="Tu nombre y apellido" />
            <EditableField label="Teléfono" value={phone} onChange={setPhone} placeholder="9xx xxx xxx" />
            <EditableField label="Dirección de envío" value={address} onChange={setAddress} placeholder="Calle, número, referencia" />
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={submit}
                disabled={save.isPending}
                className="flex-1 bg-primary text-primary-foreground font-sans font-bold text-sm py-2.5 hover:bg-foreground transition-colors disabled:opacity-50"
              >
                {save.isPending ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 border border-border text-muted-foreground font-sans font-bold text-sm py-2.5 hover:border-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
            {save.isError && (
              <p className="font-sans text-xs text-destructive">{apiErrorMessage(save.error)}</p>
            )}
          </>
        ) : (
          <>
            <ProfileField label="Nombre completo" value={profile?.fullName ?? ""} placeholder="Sin completar" />
            <ProfileField label="Teléfono" value={profile?.phone ?? ""} placeholder="Sin completar" />
            <ProfileField label="Dirección de envío" value={profile?.shippingAddress ?? ""} placeholder="Sin completar" />
          </>
        )}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  placeholder,
  locked,
}: {
  label: string;
  value: string;
  placeholder?: string;
  locked?: boolean;
}) {
  return (
    <div>
      <label className="font-sans text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled
        title={locked ? "El correo no se puede cambiar" : undefined}
        className="w-full bg-muted px-3 py-2 font-sans text-sm text-muted-foreground border border-transparent cursor-default"
      />
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="font-sans text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white px-3 py-2 font-sans text-sm text-foreground border border-border focus:border-primary focus:outline-none transition-colors"
      />
    </div>
  );
}
