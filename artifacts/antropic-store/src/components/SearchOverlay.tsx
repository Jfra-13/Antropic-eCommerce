import { useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PRODUCTS, CATEGORIES } from "../data/mockData";

// ponytail: no click/sales analytics yet — stand-ins until the API lands.
// Top clicked categories → first 2 categories, imaged by one of their products.
const TOP_CATEGORIES = CATEGORIES.slice(0, 2).map((name) => ({
  name,
  image: PRODUCTS.find((p) => p.category === name)?.images[0],
}));
// Best sellers → 2 products flagged mas-vendido first.
const TOP_PRODUCTS = [...PRODUCTS]
  .sort((a, b) => (b.badge === "mas-vendido" ? 1 : 0) - (a.badge === "mas-vendido" ? 1 : 0))
  .slice(0, 2);

type Tab = "smart" | "search";

export function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => onOpenChange(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    close();
    setLocation(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  };

  const openProduct = (id: string) => {
    close();
    setLocation(`/product/${id}`);
  };

  const openCategory = (name: string) => {
    close();
    setLocation(`/search?category=${encodeURIComponent(name)}`);
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 pb-2 text-sm font-sans font-bold uppercase tracking-wide transition-colors ${
      active
        ? "text-foreground border-b-2 border-foreground"
        : "text-muted-foreground border-b-2 border-transparent hover:text-foreground"
    }`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          // Mobile: full-screen takeover. Desktop: top dropdown panel, header stays visible.
          className="fixed inset-0 z-50 bg-background overflow-y-auto md:inset-x-0 md:top-0 md:bottom-auto md:max-h-[85vh] md:border-b md:border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:data-[state=closed]:slide-out-to-top-4 md:data-[state=open]:slide-in-from-top-4"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">Buscar</DialogPrimitive.Title>

          <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
            {/* Tabs + close */}
            <div className="relative flex items-center justify-center gap-6 md:gap-8">
              <button type="button" onClick={() => setTab("smart")} className={tabClass(tab === "smart")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" /></svg>
                Smart Search
              </button>
              <div className="w-px h-4 bg-border" />
              <button type="button" onClick={() => setTab("search")} className={tabClass(tab === "search")}>
                Search
              </button>
              <DialogPrimitive.Close
                className="absolute right-0 top-0 p-1 text-foreground hover:text-primary transition-colors"
                aria-label="Cerrar búsqueda"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
              </DialogPrimitive.Close>
            </div>

            {tab === "search" ? (
              <>
                {/* Input — underline style, centered narrow on desktop, full-width on mobile. */}
                <form onSubmit={submit} className="mt-8 md:max-w-xl md:mx-auto">
                  <div className="flex items-center gap-3 border-b border-foreground pb-2">
                    <svg className="text-muted-foreground flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    <input
                      ref={inputRef}
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por producto o colección"
                      className="w-full bg-transparent font-sans text-foreground placeholder:text-muted-foreground outline-none"
                      data-testid="input-search-overlay"
                    />
                  </div>
                </form>

                {/* Top clicked */}
                <div className="mt-10">
                  <span className="block text-xs font-sans font-bold uppercase tracking-wider text-foreground mb-4">Top clicked</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    {/* First two: most-clicked categories */}
                    {TOP_CATEGORIES.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => openCategory(c.name)}
                        className="group flex flex-col items-center text-center"
                        data-testid={`top-category-${c.name}`}
                      >
                        <div className="w-full aspect-[3/4] overflow-hidden bg-muted">
                          {c.image && <img src={c.image} alt={c.name} className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105" loading="lazy" />}
                        </div>
                        <p className="mt-2 font-sans text-sm text-foreground line-clamp-1">{c.name}</p>
                      </button>
                    ))}
                    {/* Then two: best-selling products */}
                    {TOP_PRODUCTS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openProduct(p.id)}
                        className="group flex flex-col items-center text-center"
                        data-testid={`top-product-${p.id}`}
                      >
                        <div className="w-full aspect-[3/4] overflow-hidden bg-muted">
                          <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        </div>
                        <p className="mt-2 font-sans text-sm text-foreground line-clamp-1">{p.name}</p>
                        <p className="font-sans text-sm text-muted-foreground">{p.price}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <p className="font-sans font-bold text-foreground uppercase tracking-wide">Smart Search</p>
                <p className="mt-2 font-sans text-sm text-muted-foreground">En desarrollo.</p>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
