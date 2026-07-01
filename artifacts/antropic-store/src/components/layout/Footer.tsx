import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-[#341620] text-white pt-12 pb-6 px-6 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-10">
        <div className="flex flex-col gap-2">
          <Link href="/" className="font-display text-3xl text-[#B4536E] cursor-pointer">Antropic</Link>
          <p className="text-[#E3CBCF] font-sans text-sm">Moda que te hace brillar.</p>
        </div>
        
        <div className="flex flex-col gap-3">
          <h4 className="font-serif text-lg text-[#C89B5E]">Enlaces</h4>
          <a href="#" className="font-sans text-sm text-white/80 hover:text-white transition-colors">Sobre nosotros</a>
          <a href="#" className="font-sans text-sm text-white/80 hover:text-white transition-colors">Contacto</a>
          <a href="#" className="font-sans text-sm text-white/80 hover:text-white transition-colors">FAQ</a>
          <a href="#" className="font-sans text-sm text-white/80 hover:text-white transition-colors">Envíos</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-serif text-lg text-[#C89B5E]">Síguenos</h4>
          <div className="flex gap-4">
            <a href="#" className="text-white hover:text-[#B4536E] transition-colors" aria-label="Instagram">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
              </svg>
            </a>
            <a href="#" className="text-white hover:text-[#B4536E] transition-colors" aria-label="TikTok">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
      
      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-[#6E4351] text-center">
        <p className="font-sans text-xs text-[#E3CBCF]">© 2025 Antropic. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
