import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { useLocation } from "wouter";

export default function Login() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const { login, user } = useStore();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation("/profile");
    return null;
  }

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    login();
    setLocation("/profile");
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
            onClick={() => setActiveTab("login")}
          >
            Iniciar Sesión
          </button>
          <button 
            className={`flex-1 py-3 font-sans font-bold text-sm transition-all ${activeTab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab("register")}
          >
            Registrarse
          </button>
        </div>

        {activeTab === "login" ? (
          <form onSubmit={handleAuth} className="flex flex-col gap-5">
            <div>
              <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Correo electrónico</label>
              <input 
                type="email" 
                required
                className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                placeholder="hola@ejemplo.com"
              />
            </div>
            <div>
              <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div className="text-right">
              <a href="#" className="font-sans text-sm text-primary hover:underline">¿Olvidaste tu contraseña?</a>
            </div>
            <button type="submit" className="w-full bg-primary text-white font-sans font-bold text-lg py-4 mt-2 hover:bg-foreground transition-colors shadow-md">
              Entrar
            </button>
          </form>
        ) : (
          <form onSubmit={handleAuth} className="flex flex-col gap-5">
            <div>
              <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Nombre completo</label>
              <input 
                type="text" 
                required
                className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                placeholder="María García"
              />
            </div>
            <div>
              <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Correo electrónico</label>
              <input 
                type="email" 
                required
                className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                placeholder="hola@ejemplo.com"
              />
            </div>
            <div>
              <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="w-full bg-primary text-white font-sans font-bold text-lg py-4 mt-2 hover:bg-foreground transition-colors shadow-md">
              Crear cuenta
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
