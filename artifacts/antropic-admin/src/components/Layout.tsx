import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, CreditCard, Truck, Package, Ticket, Undo2, BarChart3, Users as UsersIcon, Settings, LogOut, ChevronLeft } from "lucide-react";
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

const SIDEBAR_KEY = "admin-sidebar-pinned";

// Pinned = expanded. Preference persists across reloads; without one, small screens
// (< md) start collapsed so the content keeps the room.
function initialPinned(): boolean {
  const saved = localStorage.getItem(SIDEBAR_KEY);
  if (saved !== null) return saved === "1";
  return window.matchMedia("(min-width: 768px)").matches;
}

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
  const [pinned, setPinned] = useState(initialPinned);
  const items = NAV.filter((i) => !i.adminOnly || role === "admin");

  function togglePinned() {
    setPinned((p) => {
      localStorage.setItem(SIDEBAR_KEY, p ? "0" : "1");
      return !p;
    });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex">
        <aside
          className={`${pinned ? "w-60" : "w-16"} shrink-0 border-r border-slate-200 bg-white min-h-screen flex flex-col transition-[width] duration-200`}
        >
          <div className={`relative border-b border-slate-200 py-5 ${pinned ? "px-5" : "px-2 text-center"}`}>
            <div className="font-bold">{pinned ? "ANTROPIC" : "A"}</div>
            {pinned && <div className="text-xs text-slate-500">Backoffice</div>}
            <button
              onClick={togglePinned}
              title={pinned ? "Colapsar menú" : "Expandir menú"}
              className="absolute -right-3 top-6 z-10 rounded-full border border-slate-200 bg-white p-1 text-slate-500 shadow hover:text-slate-900"
            >
              <ChevronLeft
                size={14}
                className={`transition-transform duration-200 ${pinned ? "" : "rotate-180"}`}
              />
            </button>
          </div>
          <nav className="flex-1 py-3">
            {items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-2 py-2.5 text-sm ${
                    pinned ? "px-5" : "justify-center px-0"
                  } ${
                    location === item.href
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item.icon && <item.icon size={16} className="shrink-0" />}
                  {pinned && item.label}
                </Link>
              ) : (
                pinned && (
                  <span
                    key={item.label}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm text-slate-300 cursor-not-allowed"
                    title="Próximamente"
                  >
                    {item.label}
                  </span>
                )
              ),
            )}
          </nav>
          <div className={`border-t border-slate-200 py-4 ${pinned ? "px-5" : "px-2 text-center"}`}>
            {pinned && (
              <>
                <div className="text-xs text-slate-500 truncate">{email}</div>
                <div className="text-xs text-slate-400 mb-2 capitalize">{role}</div>
              </>
            )}
            <button
              onClick={onSignOut}
              title="Cerrar sesión"
              className={`items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 ${
                pinned ? "flex" : "inline-flex justify-center"
              }`}
            >
              <LogOut size={14} /> {pinned && "Cerrar sesión"}
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
