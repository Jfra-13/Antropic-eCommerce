import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, CreditCard, Truck, Package, Ticket, Undo2, BarChart3, Users as UsersIcon, Settings, LogOut } from "lucide-react";
import type { StaffRole } from "@/lib/session";

// Backoffice module map (requerimientos §6.0). `adminOnly` mirrors the role matrix — those
// entries are hidden from employees. Entries without an href are not built yet.
type NavItem = { label: string; href?: string; adminOnly?: boolean; icon?: typeof CreditCard };

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Verificación de pagos", href: "/payments", icon: CreditCard },
  { label: "Pedidos" },
  { label: "Envíos / Logística", href: "/shipments", icon: Truck },
  { label: "Catálogo & Inventario", href: "/inventory", icon: Package },
  { label: "Cupones", href: "/coupons", adminOnly: true, icon: Ticket },
  { label: "Devoluciones", href: "/returns", icon: Undo2 },
  { label: "Reportes", href: "/reports", adminOnly: true, icon: BarChart3 },
  { label: "Usuarios", href: "/users", adminOnly: true, icon: UsersIcon },
  { label: "Configuración", href: "/config", adminOnly: true, icon: Settings },
];

export default function Layout({
  children,
  email,
  role,
  onSignOut,
}: {
  children: ReactNode;
  email: string;
  role: StaffRole;
  onSignOut: () => void;
}) {
  const [location] = useLocation();
  const items = NAV.filter((i) => !i.adminOnly || role === "admin");

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex">
        <aside className="w-60 shrink-0 border-r border-slate-200 bg-white min-h-screen flex flex-col">
          <div className="px-5 py-5 border-b border-slate-200">
            <div className="font-bold">ANTROPIC</div>
            <div className="text-xs text-slate-500">Backoffice</div>
          </div>
          <nav className="flex-1 py-3">
            {items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm ${
                    location === item.href
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item.icon && <item.icon size={16} />}
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm text-slate-300 cursor-not-allowed"
                  title="Próximamente"
                >
                  {item.label}
                </span>
              ),
            )}
          </nav>
          <div className="border-t border-slate-200 px-5 py-4">
            <div className="text-xs text-slate-500 truncate">{email}</div>
            <div className="text-xs text-slate-400 mb-2 capitalize">{role}</div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
