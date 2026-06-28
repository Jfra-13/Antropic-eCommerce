import { useState } from "react";
import { PRODUCTS, CATEGORIES } from "../data/mockData";
import { ProductCard } from "../components/ProductCard";
import { FlowerIcon } from "../components/ui/icons";

export default function Search() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredProducts = PRODUCTS.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory ? p.category === activeCategory : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#FDE9E6] pb-20">
      <div className="bg-white border-b border-[#f0c4d0] sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a4a5f]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input 
              type="text" 
              placeholder="Buscar productos..."
              className="w-full bg-[#f5e0e5] border-none rounded-full py-3 pl-12 pr-4 font-sans text-[#3d1a24] placeholder:text-[#8a4a5f] focus:ring-2 focus:ring-[#EA4C75] outline-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex overflow-x-auto gap-2 mt-4 pb-2 hide-scrollbar snap-x">
            <button
              onClick={() => setActiveCategory(null)}
              className={`snap-start flex-none font-sans font-bold text-sm px-5 py-2 rounded-full border-2 transition-colors ${
                activeCategory === null 
                  ? "bg-[#EA4C75] text-white border-[#EA4C75]" 
                  : "border-[#f0c4d0] text-[#8a4a5f] hover:border-[#EA4C75] hover:text-[#EA4C75]"
              }`}
            >
              Todos
            </button>
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`snap-start flex-none font-sans font-bold text-sm px-5 py-2 rounded-full border-2 transition-colors ${
                  activeCategory === category 
                    ? "bg-[#EA4C75] text-white border-[#EA4C75]" 
                    : "border-[#f0c4d0] text-[#8a4a5f] hover:border-[#EA4C75] hover:text-[#EA4C75]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8">
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {filteredProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-[#f0c4d0] w-24 h-24 mb-6">
              <FlowerIcon />
            </div>
            <h3 className="font-serif text-2xl text-[#3d1a24] mb-2">No se encontraron resultados</h3>
            <p className="font-sans text-[#8a4a5f]">Intenta buscar con otros términos o cambia la categoría.</p>
            <button 
              onClick={() => {
                setSearchQuery("");
                setActiveCategory(null);
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
