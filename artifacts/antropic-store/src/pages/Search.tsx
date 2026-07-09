import { useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { priceToNumber, productSizes, productStock } from "../lib/product";
import { useProducts, useCategories, useOccasions } from "../lib/catalog";
import { ProductCard } from "../components/ProductCard";
import { CategoryPills } from "../components/CategoryPills";
import { Breadcrumb, type Crumb } from "../components/Breadcrumb";
import { FlowerIcon } from "../components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortKey = "destacados" | "precio-asc" | "precio-desc";

const SORT_LABELS: Record<SortKey, string> = {
  destacados: "Destacados",
  "precio-asc": "Precio: menor a mayor",
  "precio-desc": "Precio: mayor a menor",
};

export default function Search() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const { products } = useProducts();
  const { categories } = useCategories();
  const { occasions } = useOccasions();

  const categoryNames = categories.map((c) => c.name);
  const occasionNames = occasions.map((o) => o.name);

  const categoryPills = [
    { label: "Todos", value: null as string | null },
    ...categoryNames.map((c) => ({ label: c, value: c })),
  ];

  // URL is the single source of truth — shareable, back-button correct.
  const q = params.get("q") ?? "";
  const category = categoryNames.find((c) => c.toLowerCase() === (params.get("category") ?? "").toLowerCase()) ?? null;
  const occasion = occasionNames.find((o) => o === params.get("occasion")) ?? null;
  const selectedSizes = params.get("sizes")?.split(",").filter(Boolean) ?? [];
  const selectedColors = params.get("colors")?.split(",").filter(Boolean) ?? [];
  const sortBy = (params.get("sort") as SortKey) ?? "destacados";
  const view = params.get("view") === "compact" ? "compact" : "detailed";
  const showFilters = params.get("filters") === "1";

  const commit = (next: URLSearchParams, replace = false) => {
    const s = next.toString();
    setLocation(s ? `/search?${s}` : "/search", { replace });
  };

  const setParam = (key: string, value: string | null, replace = false) => {
    const next = new URLSearchParams(searchString);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    commit(next, replace);
  };

  const toggleInList = (key: string, item: string) => {
    const next = new URLSearchParams(searchString);
    const cur = next.get(key)?.split(",").filter(Boolean) ?? [];
    const updated = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
    if (updated.length) next.set(key, updated.join(","));
    else next.delete(key);
    commit(next);
  };

  const inScope = useMemo(
    () =>
      products.filter((p) => {
        const matchesSearch = p.name.toLowerCase().includes(q.toLowerCase());
        const matchesCategory = category ? p.category === category : true;
        const matchesOccasion = occasion ? p.occasion.includes(occasion) : true;
        return matchesSearch && matchesCategory && matchesOccasion;
      }),
    [products, q, category, occasion]
  );

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    inScope.filter((p) => productStock(p) > 0).forEach((p) => productSizes(p).forEach((s) => set.add(s)));
    return Array.from(set);
  }, [inScope]);

  const availableColors = useMemo(() => {
    const map = new Map<string, string>();
    inScope.filter((p) => productStock(p) > 0).forEach((p) => p.colors.forEach((c) => map.set(c.name, c.hex)));
    return Array.from(map.entries()).map(([name, hex]) => ({ name, hex }));
  }, [inScope]);

  const filteredProducts = useMemo(() => {
    const result = inScope.filter((p) => {
      const matchesSize = selectedSizes.length === 0 || productSizes(p).some((s) => selectedSizes.includes(s));
      const matchesColor = selectedColors.length === 0 || p.colors.some((c) => selectedColors.includes(c.name));
      return matchesSize && matchesColor;
    });

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "precio-asc":
          return priceToNumber(a.price) - priceToNumber(b.price);
        case "precio-desc":
          return priceToNumber(b.price) - priceToNumber(a.price);
        default:
          return 0;
      }
    });
  }, [inScope, selectedSizes, selectedColors, sortBy]);

  const clearFilters = () => {
    const next = new URLSearchParams(searchString);
    next.delete("sizes");
    next.delete("colors");
    commit(next);
  };

  const activeFilterCount = selectedSizes.length + selectedColors.length;

  // Contextual breadcrumb — takes the place of the removed search bar.
  const crumbs: Crumb[] = [{ label: "Ropa", href: "/search" }];
  if (category) crumbs.push({ label: category });
  else if (occasion) crumbs.push({ label: occasion });
  else if (q) crumbs.push({ label: `"${q}"` });

  const gridClass =
    view === "compact"
      ? "grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3"
      : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background pb-20">
      {/* Breadcrumb (replaces the old search bar) + category pills */}
      <div className="bg-background border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Breadcrumb items={crumbs} />

          <div className="mt-4">
            <CategoryPills
              items={categoryPills}
              active={category}
              onSelect={(v) => setParam("category", v)}
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8">
        <div className="mb-6">
          <h1 className="font-sans font-bold text-2xl md:text-3xl uppercase tracking-wide text-foreground mb-4">
            {occasion ?? category ?? (q ? `Resultados para "${q}"` : "Todos los productos")}
          </h1>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setParam("filters", showFilters ? null : "1")}
                className="flex items-center gap-2 font-sans font-bold text-sm bg-background border border-border text-foreground px-4 py-2 hover:border-primary transition-colors"
                data-testid="button-filters"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" /></svg>
                Filtros
                {activeFilterCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <span className="font-sans text-sm text-muted-foreground" data-testid="text-item-count">
                {filteredProducts.length} {filteredProducts.length === 1 ? "artículo" : "artículos"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Density toggle */}
              <div className="hidden sm:flex items-center border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setParam("view", null)}
                  aria-label="Vista detallada"
                  className={`px-3 py-2 ${view === "detailed" ? "bg-foreground text-background" : "text-foreground hover:bg-muted"}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => setParam("view", "compact")}
                  aria-label="Vista compacta"
                  className={`px-3 py-2 ${view === "compact" ? "bg-foreground text-background" : "text-foreground hover:bg-muted"}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="4" height="4" /><rect x="10" y="3" width="4" height="4" /><rect x="17" y="3" width="4" height="4" /><rect x="3" y="10" width="4" height="4" /><rect x="10" y="10" width="4" height="4" /><rect x="17" y="10" width="4" height="4" /></svg>
                </button>
              </div>

              <label className="font-sans text-sm text-muted-foreground hidden sm:inline">Ordenar por</label>
              <Select value={sortBy} onValueChange={(v) => setParam("sort", v === "destacados" ? null : v)}>
                <SelectTrigger
                  className="w-auto min-w-[11rem] h-auto border-border bg-background text-foreground font-sans font-bold text-sm px-4 py-2 shadow-none focus:ring-2 focus:ring-primary"
                  data-testid="select-sort"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-background">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <SelectItem
                      key={key}
                      value={key}
                      className="font-sans text-foreground cursor-pointer focus:bg-muted focus:text-primary"
                    >
                      {SORT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 bg-background border border-border p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <span className="font-sans font-bold text-sm text-foreground">Tallas disponibles</span>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.length === 0 && <span className="text-sm text-muted-foreground">Sin tallas disponibles</span>}
                  {availableSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleInList("sizes", size)}
                      className={`min-w-[3rem] px-4 py-2 border font-sans font-bold text-sm transition-all ${
                        selectedSizes.includes(size)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:border-primary"
                      }`}
                      data-testid={`filter-size-${size}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="font-sans font-bold text-sm text-foreground">Colores disponibles</span>
                <div className="flex flex-wrap gap-3">
                  {availableColors.length === 0 && <span className="text-sm text-muted-foreground">Sin colores disponibles</span>}
                  {availableColors.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => toggleInList("colors", color.name)}
                      aria-label={color.name}
                      title={color.name}
                      className={`w-9 h-9 rounded-full border transition-all ${
                        selectedColors.includes(color.name)
                          ? "ring-2 ring-offset-2 ring-primary border-transparent"
                          : "border-border"
                      }`}
                      style={{ backgroundColor: color.hex }}
                      data-testid={`filter-color-${color.name}`}
                    />
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="self-start font-sans font-bold text-sm text-primary hover:underline"
                  data-testid="button-clear-filters"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {filteredProducts.length > 0 ? (
          <div className={gridClass}>
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} compact={view === "compact"} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-border w-24 h-24 mb-6">
              <FlowerIcon />
            </div>
            <h3 className="font-sans font-bold text-2xl uppercase text-foreground mb-2">No se encontraron resultados</h3>
            <p className="font-sans text-muted-foreground">Intenta buscar con otros términos o cambia los filtros.</p>
            <button
              type="button"
              onClick={() => setLocation("/search")}
              className="mt-6 font-sans font-bold text-primary hover:underline"
            >
              Borrar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
