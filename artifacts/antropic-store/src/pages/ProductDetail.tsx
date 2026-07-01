import { useState } from "react";
import { Link, useRoute } from "wouter";
import { PRODUCTS } from "../data/mockData";
import { useStore } from "../context/StoreContext";
import { Stars } from "../components/Stars";
import { ProductCard } from "../components/ProductCard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import NotFound from "./not-found";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const product = PRODUCTS.find((p) => p.id === params?.id);

  const { addToCart, toggleFavorite, favorites } = useStore();
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  if (!product) return <NotFound />;

  const isFavorite = favorites.includes(product.id);
  const similar = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, 8);

  return (
    <div className="min-h-screen bg-[#FDE9E6]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1 text-xs md:text-sm font-sans text-[#8a4a5f] mb-6">
          <Link href="/search" className="hover:text-[#EA4C75] transition-colors">Ropa</Link>
          <span>/</span>
          <Link href={`/search?category=${product.category}`} className="hover:text-[#EA4C75] transition-colors">
            {product.category}
          </Link>
          <span>/</span>
          <span className="text-[#3d1a24] font-bold">{product.name}</span>
        </nav>

        {/* Main layout */}
        <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
          {/* Images ~2/3 */}
          <div className="w-full md:w-2/3">
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              {[0, 1].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setZoomIndex(i)}
                  className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#f5e0e5] border border-[#f0c4d0] cursor-zoom-in"
                  aria-label={`Ampliar imagen de ${product.name}`}
                  data-testid={`button-zoom-${i}`}
                >
                  <img
                    src={product.image}
                    alt={`${product.name} ${i + 1}`}
                    className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
                  />
                  <span className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-full p-2 text-[#EA4C75] opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                      <line x1="11" x2="11" y1="8" y2="14" />
                      <line x1="8" x2="14" y1="11" y2="11" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Info panel ~1/3 */}
          <div className="w-full md:w-1/3 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-serif text-2xl md:text-3xl text-[#3d1a24] leading-tight">{product.name}</h1>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <Stars rating={product.rating} size={16} />
                <span className="flex items-center gap-1 text-xs font-sans text-[#8a4a5f]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#EA4C75]">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  </svg>
                  {product.likes}
                </span>
              </div>
            </div>

            <span className="font-sans font-bold text-3xl text-[#EA4C75]">{product.price}</span>

            {/* Colors */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-sans font-bold text-[#3d1a24]">
                Color: <span className="font-normal text-[#8a4a5f]">{product.colors[selectedColor]?.name}</span>
              </span>
              <div className="flex items-center gap-3">
                {product.colors.map((color, i) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => setSelectedColor(i)}
                    aria-label={color.name}
                    className={`w-8 h-8 rounded-full border transition-all ${
                      selectedColor === i ? "ring-2 ring-offset-2 ring-[#EA4C75] border-transparent" : "border-[#f0c4d0]"
                    }`}
                    style={{ backgroundColor: color.hex }}
                    data-testid={`swatch-${color.name}`}
                  />
                ))}
              </div>
            </div>

            {/* Fit label */}
            <span className="text-xs font-sans font-bold uppercase tracking-widest text-[#3d1a24]">
              Ajuste: {product.fit}
            </span>

            {/* Sizes */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-sans font-bold text-[#3d1a24]">Talla</span>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`min-w-[3rem] px-4 py-2 rounded-full border font-sans font-bold text-sm transition-all ${
                      selectedSize === size
                        ? "bg-[#EA4C75] text-white border-[#EA4C75]"
                        : "bg-white text-[#3d1a24] border-[#f0c4d0] hover:border-[#EA4C75]"
                    }`}
                    data-testid={`size-${size}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => addToCart(product.id)}
                disabled={product.stock <= 0}
                className="flex-grow bg-[#EA4C75] text-white font-sans font-bold text-lg py-4 rounded-full hover:bg-[#3d1a24] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#EA4C75]"
                data-testid="button-add-bag"
              >
                {product.stock <= 0 ? "Agotado" : "Agregar a la bolsa"}
              </button>
              <button
                type="button"
                onClick={() => toggleFavorite(product.id)}
                aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                className="flex-none w-14 h-14 flex items-center justify-center rounded-full border-2 border-[#EA4C75] text-[#EA4C75] hover:bg-[#EA4C75] hover:text-white transition-colors"
                data-testid="button-favorite-detail"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                </svg>
              </button>
            </div>

            {/* Details */}
            <div className="border-t border-[#f0c4d0] pt-5 mt-2">
              <h2 className="font-serif text-xl text-[#3d1a24] mb-2">Detalles del producto</h2>
              <p className="font-sans text-sm text-[#8a4a5f] leading-relaxed">{product.details}</p>
            </div>
          </div>
        </div>

        {/* Similar products */}
        {similar.length > 0 && (
          <section className="mt-16">
            <h2 className="font-serif text-2xl md:text-3xl text-[#EA4C75] mb-6">También te puede gustar</h2>
            <div className="overflow-x-auto hide-scrollbar -mx-4 px-4">
              <div className="flex gap-4 py-2">
                {similar.map((p) => (
                  <div key={p.id} className="w-40 md:w-56 flex-none">
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Image lightbox */}
      <Dialog open={zoomIndex !== null} onOpenChange={(open) => !open && setZoomIndex(null)}>
        <DialogContent className="max-w-3xl p-2 bg-white border-[#f0c4d0] rounded-2xl">
          <DialogTitle className="sr-only">{product.name}</DialogTitle>
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
