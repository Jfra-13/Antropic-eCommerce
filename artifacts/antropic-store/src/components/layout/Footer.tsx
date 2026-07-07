import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-foreground text-background pt-12 pb-6 px-6 mt-20">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1 flex flex-col gap-2">
          <Link href="/" className="font-display text-3xl text-primary cursor-pointer">Antropic</Link>
          <p className="text-background/70 font-sans text-sm">Moda que te hace brillar.</p>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-sans font-bold text-sm uppercase tracking-wide text-background/90">Ayuda</h4>
          <a href="#" className="font-sans text-sm text-background/80 hover:text-background transition-colors">Cambios y devoluciones</a>
          <a href="#" className="font-sans text-sm text-background/80 hover:text-background transition-colors">Envíos</a>
          <a href="#" className="font-sans text-sm text-background/80 hover:text-background transition-colors">Preguntas frecuentes</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-sans font-bold text-sm uppercase tracking-wide text-background/90">Recojo en tienda</h4>
          <p className="font-sans text-sm text-background/80">Puntos de recojo en La Molina.</p>
          <a href="#" className="font-sans text-sm text-background/80 hover:text-background transition-colors">Ver ubicaciones</a>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="font-sans font-bold text-sm uppercase tracking-wide text-background/90">Contacto</h4>
          <a href="https://wa.me/51999999999" className="font-sans text-sm text-background/80 hover:text-background transition-colors flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.42 1.31-1.95 1.36-.5.05-1.13.24-3.65-.76-3.07-1.2-5.03-4.36-5.18-4.56-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.54c.28-.3.61-.38.81-.38l.58.01c.19.01.44-.07.69.53.24.6.83 2.07.9 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.61.17.3.76 1.26 1.64 2.04 1.13 1.01 2.08 1.32 2.38 1.47.3.15.47.12.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.22.57.35.07.12.07.72-.17 1.4Z" /></svg>
            WhatsApp
          </a>
          <div className="flex gap-4 mt-1">
            <a href="#" className="text-background hover:text-primary transition-colors" aria-label="Instagram">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
            </a>
            <a href="#" className="text-background hover:text-primary transition-colors" aria-label="TikTok">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-background/20 text-center">
        <p className="font-sans text-xs text-background/70">© 2025 Antropic. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
