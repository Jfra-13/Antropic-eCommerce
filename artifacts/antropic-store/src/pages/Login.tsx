import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { useLocation } from "wouter";

export default function Login() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const { login, register, user } = useStore();
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    setLocation("/profile");
    return null;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result =
      activeTab === "login"
        ? await login(email, password)
        : await register(name, email, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    // On login the session is ready immediately; on register with email confirmation
    // enabled there is no session yet, so send the user to login in that case.
    setLocation(activeTab === "login" ? "/profile" : "/login");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center px-4 py-12">
      <div className="bg-white w-full max-w-md shadow-xl p-8 md:p-10 border border-border">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-primary mb-2">Antropic</h1>
          <p className="font-serif text-muted-foreground text-lg">Bienvenida a tu estilo</p>
        </div>

        <div className="flex bg-muted p-1 mb-8">
          <button
            className={`flex-1 py-3 font-sans font-bold text-sm transition-all ${activeTab === 'login' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => { setActiveTab("login"); setError(null); }}
          >
            Iniciar Sesión
          </button>
          <button
            className={`flex-1 py-3 font-sans font-bold text-sm transition-all ${activeTab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => { setActiveTab("register"); setError(null); }}
          >
            Registrarse
          </button>
        </div>

        {error && (
          <div className="mb-5 bg-destructive/10 text-destructive text-sm font-sans px-4 py-3 border border-destructive/30">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-5">
          {activeTab === "register" && (
            <div>
              <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Nombre completo</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                placeholder="María García"
              />
            </div>
          )}
          <div>
            <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Correo electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
              placeholder="hola@ejemplo.com"
            />
          </div>
          <div>
            <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>
          {activeTab === "login" && (
            <div className="text-right">
              <a href="#" className="font-sans text-sm text-primary hover:underline">¿Olvidaste tu contraseña?</a>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white font-sans font-bold text-lg py-4 mt-2 hover:bg-foreground transition-colors shadow-md disabled:opacity-60"
          >
            {submitting ? "Procesando…" : activeTab === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}
