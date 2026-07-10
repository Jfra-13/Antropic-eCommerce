import { Link, useLocation } from "wouter";
import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useStore } from "../context/StoreContext";
import { formatPrice, priceToNumber } from "../lib/product";
import { orderStatusLabel } from "../lib/orders";

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
