import { Switch, Route } from "wouter";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import PaymentVerification from "@/pages/PaymentVerification";
import Shipments from "@/pages/Shipments";
import Inventory from "@/pages/Inventory";
import Coupons from "@/pages/Coupons";
import Returns from "@/pages/Returns";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import Config from "@/pages/Config";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 text-center">
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );
}

export default function App() {
  const { loading, session, role, error } = useSession();
  const signOut = () => supabase.auth.signOut();

  if (loading) return <Centered>Cargando…</Centered>;

  // Not signed in — or signed in but the profile lookup failed (surface the error on Login).
  if (!session) return <Login />;
  if (error) return <Login error={`No se pudo verificar tu cuenta: ${error}`} />;

  // Signed in but not staff. Authorization is enforced by the API too; this is just UX.
  if (role !== "employee" && role !== "admin") {
    return (
      <Centered>
        <div className="rounded-lg border border-slate-200 bg-white p-8">
          <p className="font-medium text-slate-900">Sin acceso al backoffice</p>
          <p className="mt-1">Esta cuenta no tiene permisos de empleado o administrador.</p>
          <button onClick={signOut} className="mt-4 text-slate-600 hover:text-slate-900 underline">
            Cerrar sesión
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <Layout email={session.user.email ?? ""} role={role} onSignOut={signOut}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/payments" component={PaymentVerification} />
        <Route path="/shipments" component={Shipments} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/coupons" component={Coupons} />
        <Route path="/returns" component={Returns} />
        <Route path="/reports" component={Reports} />
        <Route path="/users" component={Users} />
        <Route path="/config" component={Config} />
        <Route>
          <div className="text-sm text-slate-500">Página no encontrada.</div>
        </Route>
      </Switch>
    </Layout>
  );
}
