import { useState } from "react";
import { Link } from "wouter";
import { useStore } from "../../context/StoreContext";
import { useCategories, useOccasions } from "../../lib/catalog";
import { useStoreConfig } from "../../lib/config";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { SearchOverlay } from "../SearchOverlay";
import modelo_01 from "../../assets/modelo_01.webp";
import modelo_02 from "../../assets/modelo_02.webp";

// Categories the navbar promotes to top-level links (by slug). Everything else
// goes under the "Ropa" dropdown. The public API returns active categories only,
// so presence in the list is the visibility switch.
const TOP_LEVEL_SLUGS = ["sale", "novedades", "accesorios"];

const categoryHref = (name: string) => `/search?category=${encodeURIComponent(name)}`;

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { cart, favorites } = useStore();
  const { occasions } = useOccasions();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { config, isLoading: configLoading } = useStoreConfig();

  // Admin-managed announcement strip: null hides it. While the config loads, an empty
  // strip holds the height so the page doesn't jump when the text arrives.
  const announcementText = config?.announcementText ?? null;

  // While the catalog loads, keep the default nav structure to avoid a flash
  // of an empty menu; once loaded, the DB decides what shows.
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const topLevel = (slug: string, fallbackName: string) =>
    bySlug.get(slug) ?? (categoriesLoading ? { slug, name: fallbackName } : undefined);
  const sale = topLevel("sale", "Sale");
  const novedades = topLevel("novedades", "Novedades");
  const accesorios = topLevel("accesorios", "Accesorios");
  const ropaCategories = categories
    .filter((c) => !TOP_LEVEL_SLUGS.includes(c.slug))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const cartItemsCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="sticky top-0 z-50 bg-background border-b border-border">
      {/* Announcement banner — admin-managed; brand color is its role here (promotional). */}
      {(configLoading || announcementText) && (
        <div className="bg-primary text-primary-foreground text-xs font-sans text-center py-2 px-4 whitespace-nowrap overflow-hidden">
          <div className="animate-marquee md:animate-none inline-block">
            {announcementText ?? " "}
          </div>
        </div>
      )}

      <nav className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {/* Mobile menu toggle */}
        <div className="md:hidden flex items-center w-1/3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 -ml-2 text-foreground hover:text-primary transition-colors"
            data-testid="button-menu-toggle"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isOpen ? (
                <>
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="6" y2="6" />
                  <line x1="4" x2="20" y1="18" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center md:justify-start w-1/3 md:w-auto">
          <Link href="/" className="font-display text-3xl text-primary -mt-1 cursor-pointer">Antropic</Link>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center">
          <NavigationMenu>
            <NavigationMenuList className="gap-2">
              {sale && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link href={categoryHref(sale.name)} className="inline-flex h-9 items-center px-3 text-sm font-sans font-semibold text-promo hover:bg-muted transition-colors cursor-pointer">
                      {sale.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}

              {novedades && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link href={categoryHref(novedades.name)} className="inline-flex h-9 items-center px-3 text-sm font-sans font-semibold text-foreground hover:bg-muted hover:text-primary transition-colors cursor-pointer">
                      {novedades.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}

              <NavigationMenuItem>
                <NavigationMenuTrigger className="h-9 px-3 rounded-none text-sm font-sans font-semibold text-foreground bg-transparent hover:bg-muted hover:text-primary data-[state=open]:bg-muted data-[state=open]:text-primary [&>svg]:hidden">
                  Ropa
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="flex gap-10 p-8 w-[44rem]">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-sans font-bold uppercase tracking-wider text-muted-foreground mb-1">Categorías</span>
                      {ropaCategories.map((c) => (
                        <NavigationMenuLink asChild key={c.slug}>
                          <Link href={categoryHref(c.name)} className="text-sm font-sans text-foreground hover:text-primary transition-colors cursor-pointer">{c.name}</Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-sans font-bold uppercase tracking-wider text-muted-foreground mb-1">Ocasión de uso</span>
                      {occasions.map((o) => (
                        <NavigationMenuLink asChild key={o.slug}>
                          <Link href={`/search?occasion=${o.name}`} className="text-sm font-sans text-foreground hover:text-primary transition-colors cursor-pointer">{o.name}</Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      {novedades && (
                        <Link href={categoryHref(novedades.name)} className="group relative aspect-[3/4] overflow-hidden bg-muted">
                          <img src={modelo_01} alt={novedades.name} className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
                          <span className="absolute bottom-2 left-2 bg-background/90 text-foreground text-xs font-sans font-bold px-2 py-1">{novedades.name}</span>
                        </Link>
                      )}
                      {sale && (
                        <Link href={categoryHref(sale.name)} className="group relative aspect-[3/4] overflow-hidden bg-muted">
                          <img src={modelo_02} alt={sale.name} className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
                          <span className="absolute bottom-2 left-2 bg-promo text-promo-foreground text-xs font-sans font-bold px-2 py-1">{sale.name}</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {accesorios && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link href={categoryHref(accesorios.name)} className="inline-flex h-9 items-center px-3 text-sm font-sans font-semibold text-foreground hover:bg-muted hover:text-primary transition-colors cursor-pointer">
                      {accesorios.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right icons */}
        <div className="flex items-center justify-end w-1/3 md:w-auto space-x-3 md:space-x-5 text-foreground">
          <button type="button" onClick={() => setSearchOpen(true)} className="hover:text-primary transition-colors cursor-pointer" data-testid="button-search" aria-label="Buscar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          </button>
          <Link href="/favorites" className="hover:text-primary transition-colors cursor-pointer relative" data-testid="link-favorites">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
            {favorites.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {favorites.length}
              </span>
            )}
          </Link>
          <Link href="/profile" className="hover:text-primary transition-colors cursor-pointer" data-testid="link-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </Link>
          <Link href="/cart" className="hover:text-primary transition-colors cursor-pointer relative" data-testid="link-cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            {cartItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartItemsCount}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {isOpen && (
        <div className="md:hidden border-t border-border bg-background py-4 px-6 shadow-md absolute w-full font-sans font-semibold text-lg flex flex-col gap-4">
          {sale && (
            <Link href={categoryHref(sale.name)} onClick={() => setIsOpen(false)} className="text-promo cursor-pointer">{sale.name}</Link>
          )}
          {novedades && (
            <Link href={categoryHref(novedades.name)} onClick={() => setIsOpen(false)} className="text-foreground cursor-pointer">{novedades.name}</Link>
          )}
          <Link href="/search" onClick={() => setIsOpen(false)} className="text-foreground cursor-pointer">Ropa</Link>
          {accesorios && (
            <Link href={categoryHref(accesorios.name)} onClick={() => setIsOpen(false)} className="text-foreground cursor-pointer">{accesorios.name}</Link>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {occasions.map((o) => (
              <Link key={o.slug} href={`/search?occasion=${o.name}`} onClick={() => setIsOpen(false)} className="text-sm font-bold border border-border px-3 py-1.5 text-foreground cursor-pointer">{o.name}</Link>
            ))}
          </div>
          <Link href="/profile" onClick={() => setIsOpen(false)} className="text-foreground border-t border-border pt-4 mt-2 flex items-center gap-2 cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            Mi Cuenta
          </Link>
        </div>
      )}

      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
