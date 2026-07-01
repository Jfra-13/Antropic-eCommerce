import { Link } from "wouter";
import { Product } from "../data/mockData";
import { useStore } from "../context/StoreContext";
import { Stars } from "./Stars";

export function ProductCard({ product }: { product: Product }) {
  const { favorites, toggleFavorite, addToCart } = useStore();
  const isFavorite = favorites.includes(product.id);
  const isOut = product.stock <= 0;

  return (
    <div
      className="group relative z-10 flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm border border-[#f0c4d0] transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:z-20"
      data-testid={`card-product-${product.id}`}
    >
      {/* Stretched link sits above the image + text (z-10) so the whole card navigates;
          the action buttons sit above it (z-20) to stay independently clickable. */}
      <Link
        href={`/product/${product.id}`}
        className="absolute inset-0 z-10"
        aria-label={product.name}
        data-testid={`link-product-${product.id}`}
      />

      <div className="relative aspect-[3/4] overflow-hidden bg-[#f5e0e5]">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        {isOut && (
          <span className="absolute top-3 left-3 z-20 pointer-events-none bg-[#3d1a24] text-white text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-1 rounded-full">
            Agotado
          </span>
        )}
        <button
          type="button"
          onClick={() => toggleFavorite(product.id)}
          className="absolute top-3 right-3 z-20 p-2 bg-white/80 backdrop-blur-sm rounded-full text-[#EA4C75] hover:bg-[#EA4C75] hover:text-white transition-colors"
          aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
          data-testid={`button-favorite-${product.id}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-1">
        <span className="text-xs font-sans text-[#8a4a5f] uppercase tracking-wider">{product.category}</span>
        <h3 className="font-serif text-lg text-[#3d1a24] line-clamp-1">{product.name}</h3>
        <div className="flex items-center gap-2 text-xs text-[#8a4a5f] font-sans">
          <Stars rating={product.rating} size={12} />
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#F29CBD]">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            {product.likes}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="font-sans font-bold text-lg text-[#EA4C75]">{product.price}</span>
          <button
            type="button"
            onClick={() => addToCart(product.id)}
            disabled={isOut}
            className="relative z-20 text-sm font-sans font-bold bg-[#FDE9E6] text-[#EA4C75] px-4 py-2 rounded-full hover:bg-[#EA4C75] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#FDE9E6] disabled:hover:text-[#EA4C75]"
            data-testid={`button-add-cart-${product.id}`}
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
