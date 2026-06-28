import { Link } from "wouter";
import { Product } from "../data/mockData";
import { useStore } from "../context/StoreContext";

export function ProductCard({ product }: { product: Product }) {
  const { favorites, toggleFavorite, addToCart } = useStore();
  const isFavorite = favorites.includes(product.id);

  return (
    <div className="group flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-[#f0c4d0]">
      <div className="relative aspect-[3/4] overflow-hidden bg-[#f5e0e5]">
        <img 
          src={product.image} 
          alt={product.name} 
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <button 
          onClick={(e) => {
            e.preventDefault();
            toggleFavorite(product.id);
          }}
          className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur-sm rounded-full text-[#EA4C75] hover:bg-[#EA4C75] hover:text-white transition-colors"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          data-testid={`button-favorite-${product.id}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
        </button>
      </div>
      <div className="p-4 flex flex-col gap-1">
        <span className="text-xs font-sans text-[#8a4a5f] uppercase tracking-wider">{product.category}</span>
        <h3 className="font-serif text-lg text-[#3d1a24] line-clamp-1">{product.name}</h3>
        <div className="flex items-center justify-between mt-2">
          <span className="font-sans font-bold text-lg text-[#EA4C75]">{product.price}</span>
          <button 
            onClick={(e) => {
              e.preventDefault();
              addToCart(product.id);
            }}
            className="text-sm font-sans font-bold bg-[#FDE9E6] text-[#EA4C75] px-4 py-2 rounded-full hover:bg-[#EA4C75] hover:text-white transition-colors"
            data-testid={`button-add-cart-${product.id}`}
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
