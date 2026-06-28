import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useStore } from "../../context/StoreContext";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { cart, favorites } = useStore();

  const cartItemsCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="sticky top-0 z-50 bg-[#FDE9E6] shadow-sm">
      <div className="bg-[#EA4C75] text-white text-xs font-sans text-center py-2 px-4 whitespace-nowrap overflow-hidden">
        <div className="animate-marquee md:animate-none inline-block">
          🌸 Envío gratis en compras mayores a $50 — ¡Descubre la nueva colección!
        </div>
      </div>

      <nav className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {/* Mobile Left */}
        <div className="md:hidden flex items-center w-1/3">
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="p-2 -ml-2 text-[#3d1a24] hover:text-[#EA4C75]"
            data-testid="button-menu-toggle"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isOpen ? (
                <>
                  <line x1="18" x2="6" y1="6" y2="18"/>
                  <line x1="6" x2="18" y1="6" y2="18"/>
                </>
              ) : (
                <>
                  <line x1="4" x2="20" y1="12" y2="12"/>
                  <line x1="4" x2="20" y1="6" y2="6"/>
                  <line x1="4" x2="20" y1="18" y2="18"/>
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Center / Left Desktop */}
        <div className="flex items-center justify-center md:justify-start w-1/3 md:w-auto">
          <Link href="/" className="font-display text-3xl text-[#EA4C75] -mt-1 cursor-pointer">Antropic</Link>
        </div>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center space-x-8 font-sans font-semibold">
          <Link href="/search?category=sale" className="text-[#EA4C75] hover:opacity-80 cursor-pointer">Sale</Link>
          <Link href="/search?category=new" className="text-[#3d1a24] hover:text-[#EA4C75] cursor-pointer">New</Link>
          <Link href="/search" className="text-[#3d1a24] hover:text-[#EA4C75] cursor-pointer">Ropa</Link>
        </div>

        {/* Right Icons */}
        <div className="flex items-center justify-end w-1/3 md:w-auto space-x-3 md:space-x-5 text-[#3d1a24]">
          <Link href="/search" className="hover:text-[#EA4C75] cursor-pointer" data-testid="link-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </Link>
          <Link href="/favorites" className="hover:text-[#EA4C75] cursor-pointer relative" data-testid="link-favorites">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            {favorites.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#FCC261] text-[#3d1a24] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {favorites.length}
              </span>
            )}
          </Link>
          <Link href="/profile" className="hidden md:block hover:text-[#EA4C75] cursor-pointer" data-testid="link-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </Link>
          <Link href="/cart" className="hover:text-[#EA4C75] cursor-pointer relative" data-testid="link-cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            {cartItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#EA4C75] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartItemsCount}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="md:hidden border-t border-[#f0c4d0] bg-white py-4 px-6 shadow-md absolute w-full font-sans font-semibold text-lg flex flex-col gap-4">
          <Link href="/search?category=sale" onClick={() => setIsOpen(false)} className="text-[#EA4C75] cursor-pointer">Sale</Link>
          <Link href="/search?category=new" onClick={() => setIsOpen(false)} className="text-[#3d1a24] cursor-pointer">New</Link>
          <Link href="/search" onClick={() => setIsOpen(false)} className="text-[#3d1a24] cursor-pointer">Ropa</Link>
          <Link href="/profile" onClick={() => setIsOpen(false)} className="text-[#3d1a24] border-t border-[#f0c4d0] pt-4 mt-2 flex items-center gap-2 cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Mi Cuenta
          </Link>
        </div>
      )}
    </div>
  );
}
