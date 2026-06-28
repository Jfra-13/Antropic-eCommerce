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
    <div className="min-h-[calc(100vh-4rem)] bg-[#FDE9E6] flex items-center justify-center px-4 py-12">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-xl p-8 md:p-10 border border-[#f0c4d0]">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-[#EA4C75] mb-2">Antropic</h1>
          <p className="font-serif text-[#8a4a5f] text-lg">Bienvenida a tu estilo</p>
        </div>

        <div className="flex bg-[#f5e0e5] p-1 rounded-full mb-8">
          <button 
            className={`flex-1 py-3 rounded-full font-sans font-bold text-sm transition-all ${activeTab === 'login' ? 'bg-white text-[#EA4C75] shadow-sm' : 'text-[#8a4a5f] hover:text-[#3d1a24]'}`}
            onClick={() => setActiveTab("login")}
          >
            Iniciar Sesión
          </button>
          <button 
            className={`flex-1 py-3 rounded-full font-sans font-bold text-sm transition-all ${activeTab === 'register' ? 'bg-white text-[#EA4C75] shadow-sm' : 'text-[#8a4a5f] hover:text-[#3d1a24]'}`}
            onClick={() => setActiveTab("register")}
          >
            Registrarse
          </button>
        </div>

        {activeTab === "login" ? (
          <form onSubmit={handleAuth} className="flex flex-col gap-5">
            <div>
              <label className="font-sans text-sm font-bold text-[#3d1a24] ml-2 mb-1 block">Correo electrónico</label>
              <input 
                type="email" 
                required
                className="w-full bg-[#FDE9E6] border-2 border-transparent rounded-full px-5 py-3.5 font-sans text-[#3d1a24] focus:border-[#EA4C75] focus:outline-none transition-colors"
                placeholder="hola@ejemplo.com"
              />
            </div>
            <div>
              <label className="font-sans text-sm font-bold text-[#3d1a24] ml-2 mb-1 block">Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full bg-[#FDE9E6] border-2 border-transparent rounded-full px-5 py-3.5 font-sans text-[#3d1a24] focus:border-[#EA4C75] focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div className="text-right">
              <a href="#" className="font-sans text-sm text-[#EA4C75] hover:underline">¿Olvidaste tu contraseña?</a>
            </div>
            <button type="submit" className="w-full bg-[#EA4C75] text-white font-sans font-bold text-lg py-4 rounded-full mt-2 hover:bg-[#3d1a24] transition-colors shadow-md">
              Entrar
            </button>
          </form>
        ) : (
          <form onSubmit={handleAuth} className="flex flex-col gap-5">
            <div>
              <label className="font-sans text-sm font-bold text-[#3d1a24] ml-2 mb-1 block">Nombre completo</label>
              <input 
                type="text" 
                required
                className="w-full bg-[#FDE9E6] border-2 border-transparent rounded-full px-5 py-3.5 font-sans text-[#3d1a24] focus:border-[#EA4C75] focus:outline-none transition-colors"
                placeholder="María García"
              />
            </div>
            <div>
              <label className="font-sans text-sm font-bold text-[#3d1a24] ml-2 mb-1 block">Correo electrónico</label>
              <input 
                type="email" 
                required
                className="w-full bg-[#FDE9E6] border-2 border-transparent rounded-full px-5 py-3.5 font-sans text-[#3d1a24] focus:border-[#EA4C75] focus:outline-none transition-colors"
                placeholder="hola@ejemplo.com"
              />
            </div>
            <div>
              <label className="font-sans text-sm font-bold text-[#3d1a24] ml-2 mb-1 block">Contraseña</label>
              <input 
                type="password" 
                required
                className="w-full bg-[#FDE9E6] border-2 border-transparent rounded-full px-5 py-3.5 font-sans text-[#3d1a24] focus:border-[#EA4C75] focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="w-full bg-[#EA4C75] text-white font-sans font-bold text-lg py-4 rounded-full mt-2 hover:bg-[#3d1a24] transition-colors shadow-md">
              Crear cuenta
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
