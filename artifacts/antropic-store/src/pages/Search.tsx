import { useState, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { PRODUCTS, CATEGORIES, priceToNumber, categoryImage } from "../data/mockData";
import { ProductCard } from "../components/ProductCard";
import { CategoryCard } from "../components/CategoryCard";
import { FlowerIcon } from "../components/ui/icons";

type SortKey = "destacados" | "precio-asc" | "precio-desc" | "rating" | "likes";

const SORT_LABELS: Record<SortKey, string> = {
  destacados: "Destacados",
  "precio-asc": "Precio: menor a mayor",
  "precio-desc": "Precio: mayor a menor",
  rating: "Mejor valorados",
  likes: "Más populares",
};

export default function Search() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const resolveCategory = (raw: string | null) =>
    raw ? CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase()) ?? null : null;

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(
    resolveCategory(new URLSearchParams(searchString).get("category"))
  );
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("destacados");

  useEffect(() => {
    setActiveCategory(resolveCategory(new URLSearchParams(searchString).get("category")));
    setSelectedSizes([]);
    setSelectedColors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString]);

  const goToCategory = (category: string | null) => {
    setLocation(category ? `/search?category=${category}` : "/search");
  };

  const inCategory = useMemo(
    () =>
      PRODUCTS.filter((p) => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = activeCategory ? p.category === activeCategory : true;
        return matchesSearch && matchesCategory;
      }),
    [searchQuery, activeCategory]
  );

  // Available filter options derived from in-stock products (by stock)
  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    inCategory.filter((p) => p.stock > 0).forEach((p) => p.sizes.forEach((s) => set.add(s)));
    return Array.from(set);
  }, [inCategory]);

  const availableColors = useMemo(() => {
    const map = new Map<string, string>();
    inCategory.filter((p) => p.stock > 0).forEach((p) => p.colors.forEach((c) => map.set(c.name, c.hex)));
    return Array.from(map.entries()).map(([name, hex]) => ({ name, hex }));
  }, [inCategory]);

  const filteredProducts = useMemo(() => {
    let result = inCategory.filter((p) => {
      const matchesSize = selectedSizes.length === 0 || p.sizes.some((s) => selectedSizes.includes(s));
      const matchesColor = selectedColors.length === 0 || p.colors.some((c) => selectedColors.includes(c.name));
      return matchesSize && matchesColor;
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "precio-asc":
          return priceToNumber(a.price) - priceToNumber(b.price);
        case "precio-desc":
          return priceToNumber(b.price) - priceToNumber(a.price);
        case "rating":
          return b.rating - a.rating;
        case "likes":
          return b.likes - a.likes;
        default:
          return 0;
      }
    });

    return result;
  }, [inCategory, selectedSizes, selectedColors, sortBy]);

  const toggleSize = (size: string) =>
    setSelectedSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));

  const toggleColor = (name: string) =>
    setSelectedColors((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));

  const clearFilters = () => {
    setSelectedSizes([]);
    setSelectedColors([]);
  };

  const activeFilterCount = selectedSizes.length + selectedColors.length;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#FDE9E6] pb-20">
      {/* Sticky search + category selector */}
      <div className="bg-white border-b border-[#f0c4d0] sticky top-24 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a4a5f]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="text"
              placeholder="Buscar productos..."
              className="w-full bg-[#f5e0e5] border-none rounded-full py-3 pl-12 pr-4 font-sans text-[#3d1a24] placeholder:text-[#8a4a5f] focus:ring-2 focus:ring-[#EA4C75] outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Centered category carousel */}
          <div className="overflow-x-auto hide-scrollbar mt-4">
            <div className="flex gap-4 md:gap-6 w-max mx-auto px-2 py-2">
              <CategoryCard
                label="Todos"
                image={categoryImage("Todos")}
                active={activeCategory === null}
                onClick={() => goToCategory(null)}
              />
              {CATEGORIES.map((category) => (
                <CategoryCard
                  key={category}
                  label={category}
                  image={categoryImage(category)}
                  active={activeCategory === category}
                  onClick={() => goToCategory(category)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8">
        {/* Header row */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl md:text-4xl text-[#3d1a24] mb-4">
            {activeCategory ?? "Todos los productos"}
          </h1>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="flex items-center gap-2 font-sans font-bold text-sm bg-white border border-[#f0c4d0] text-[#3d1a24] px-4 py-2 rounded-full hover:border-[#EA4C75] transition-colors"
                data-testid="button-filters"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" /></svg>
                Filtros
                {activeFilterCount > 0 && (
                  <span className="bg-[#EA4C75] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <span className="font-sans text-sm text-[#8a4a5f]" data-testid="text-item-count">
                {filteredProducts.length} {filteredProducts.length === 1 ? "artículo" : "artículos"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="font-sans text-sm text-[#8a4a5f] hidden sm:inline">Ordenar por</label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="font-sans font-bold text-sm bg-white border border-[#f0c4d0] text-[#3d1a24] px-4 py-2 rounded-full focus:ring-2 focus:ring-[#EA4C75] outline-none cursor-pointer"
                data-testid="select-sort"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>{SORT_LABELS[key]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Collapsible filter panel */}
          {showFilters && (
            <div className="mt-4 bg-white border border-[#f0c4d0] rounded-2xl p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <span className="font-sans font-bold text-sm text-[#3d1a24]">Tallas disponibles</span>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.length === 0 && <span className="text-sm text-[#8a4a5f]">Sin tallas disponibles</span>}
                  {availableSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      className={`min-w-[3rem] px-4 py-2 rounded-full border font-sans font-bold text-sm transition-all ${
                        selectedSizes.includes(size)
                          ? "bg-[#EA4C75] text-white border-[#EA4C75]"
                          : "bg-white text-[#3d1a24] border-[#f0c4d0] hover:border-[#EA4C75]"
                      }`}
                      data-testid={`filter-size-${size}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="font-sans font-bold text-sm text-[#3d1a24]">Colores disponibles</span>
                <div className="flex flex-wrap gap-3">
                  {availableColors.length === 0 && <span className="text-sm text-[#8a4a5f]">Sin colores disponibles</span>}
                  {availableColors.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => toggleColor(color.name)}
                      aria-label={color.name}
                      title={color.name}
                      className={`w-9 h-9 rounded-full border transition-all ${
                        selectedColors.includes(color.name)
                          ? "ring-2 ring-offset-2 ring-[#EA4C75] border-transparent"
                          : "border-[#f0c4d0]"
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
                  className="self-start font-sans font-bold text-sm text-[#EA4C75] hover:underline"
                  data-testid="button-clear-filters"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Product grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-[#f0c4d0] w-24 h-24 mb-6">
              <FlowerIcon />
            </div>
            <h3 className="font-serif text-2xl text-[#3d1a24] mb-2">No se encontraron resultados</h3>
            <p className="font-sans text-[#8a4a5f]">Intenta buscar con otros términos o cambia los filtros.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                clearFilters();
                goToCategory(null);
              }}
              className="mt-6 font-sans font-bold text-[#EA4C75] hover:underline"
            >
              Borrar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
