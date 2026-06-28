import { useStore } from "../context/StoreContext";
import { useLocation } from "wouter";

export default function Profile() {
  const { user, logout } = useStore();
  const [, setLocation] = useLocation();

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
    <div className="min-h-[calc(100vh-4rem)] bg-[#FDE9E6] py-10 px-4 md:px-6">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-80 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-[#f0c4d0] flex flex-col items-center">
            <div className="w-24 h-24 bg-[#EA4C75] rounded-full flex items-center justify-center text-white font-serif text-3xl mb-4 shadow-inner">
              {initials}
            </div>
            <h2 className="font-serif text-2xl text-[#3d1a24]">{user.name}</h2>
            <p className="font-sans text-[#8a4a5f] mt-1">{user.email}</p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full bg-white text-[#EA4C75] border-2 border-[#EA4C75] font-sans font-bold text-lg py-4 rounded-full hover:bg-[#EA4C75] hover:text-white transition-colors shadow-sm"
          >
            Cerrar Sesión
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-8">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#f0c4d0]">
            <h3 className="font-serif text-2xl text-[#3d1a24] mb-6 flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#FCC261]"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>
              Mis Pedidos
            </h3>
            <div className="bg-[#FDE9E6] rounded-2xl p-8 text-center border border-[#f0c4d0] border-dashed">
              <p className="font-sans text-[#8a4a5f] text-lg">Aún no has realizado ninguna compra.</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#f0c4d0]">
            <h3 className="font-serif text-2xl text-[#3d1a24] mb-6 flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#FCC261]"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Configuración
            </h3>
            
            <div className="flex flex-col gap-4 font-sans text-lg text-[#3d1a24]">
              <div className="flex items-center justify-between py-3 border-b border-[#f5e0e5]">
                <span>Recibir boletín de noticias</span>
                <div className="w-12 h-6 bg-[#EA4C75] rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-[#f5e0e5]">
                <span>Notificaciones SMS</span>
                <div className="w-12 h-6 bg-[#f0c4d0] rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
