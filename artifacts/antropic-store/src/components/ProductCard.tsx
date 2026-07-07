import { Link } from "wouter";
import { Product, productStock } from "../data/mockData";
import { useStore } from "../context/StoreContext";

type ProductCardProps = {
  product: Product;
  /** Gallery density: bare image + hover swap, no overlays or text. */
  compact?: boolean;
  /** Show price under the name. Hidden on Home. */
  showPrice?: boolean;
};

export function ProductCard({ product, compact = false, showPrice = true }: ProductCardProps) {
  const { favorites, toggleFavorite } = useStore();
  const isFavorite = favorites.includes(product.id);
  const isOut = productStock(product) <= 0;
  const hoverImage = product.images[1];

  return (
    <div className="group relative flex flex-col" data-testid={`card-product-${product.id}`}>
      {/* Stretched link covers image + text (z-10); action controls sit above it (z-20). */}
      <Link
        href={`/product/${product.id}`}
        className="absolute inset-0 z-10"
        aria-label={product.name}
        data-testid={`link-product-${product.id}`}
      />

      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        <img
          src={product.images[0]}
          alt={product.name}
          className="w-full h-full object-cover object-center transition-opacity duration-500 group-hover:opacity-0"
          loading="lazy"
        />
        {hoverImage && (
          <img
            src={hoverImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover object-center opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            loading="lazy"
          />
        )}

        {/* Compact/gallery view: bare image + hover swap only, no overlays. */}
        {!compact && (
          <>
            {/* Badges — mutually exclusive; sold-out wins. Translucent + blur, square corners. */}
            {isOut ? (
              <span className="absolute top-3 left-3 z-20 pointer-events-none bg-foreground/80 backdrop-blur-md text-background text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-1">
                Agotado
              </span>
            ) : product.badge === "mas-vendido" ? (
              <span className="absolute top-3 left-3 z-20 pointer-events-none bg-foreground/80 backdrop-blur-md text-background text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-1">
                Más vendido
              </span>
            ) : product.badge === "nuevo" ? (
              <span className="absolute top-3 left-3 z-20 pointer-events-none bg-background/70 backdrop-blur-md text-primary text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-1">
                Nuevo
              </span>
            ) : null}

            {/* Wishlist — minimal, no heavy blurred pill. */}
            <button
              type="button"
              onClick={() => toggleFavorite(product.id)}
              className="absolute top-2 right-2 z-20 p-1.5 text-foreground hover:text-primary transition-colors"
              aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              data-testid={`button-favorite-${product.id}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>

            {/* Quick-add — floating pill inset from the image edges, translucent + blur,
                square corners. Links to the PDP so a size is always chosen. Visible on
                hover (desktop), always on mobile. */}
            {!isOut && (
              <Link
                href={`/product/${product.id}`}
                className="absolute inset-x-3 bottom-3 z-20 bg-background/70 backdrop-blur-md text-foreground text-sm font-sans font-bold text-center py-2.5 transition-all md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground"
                data-testid={`button-add-cart-${product.id}`}
              >
                Agregar
              </Link>
            )}
          </>
        )}
      </div>

      {!compact && (
        <div className="pt-1.5 flex flex-col items-center text-center gap-0.5">
          <h3 className="font-sans text-sm text-foreground line-clamp-1">{product.name}</h3>
          {showPrice && <span className="font-sans text-sm text-foreground">{product.price}</span>}
        </div>
      )}
    </div>
  );
}
