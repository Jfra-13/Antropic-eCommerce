import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { isSizeAvailable, productStock, ALL_SIZES } from "../lib/product";
import { useProduct, useProducts } from "../lib/catalog";
import { useStore } from "../context/StoreContext";
import { ProductCard } from "../components/ProductCard";
import { ProductCarousel } from "../components/ProductCarousel";
import { Breadcrumb } from "../components/Breadcrumb";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import NotFound from "./not-found";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const { product, isLoading } = useProduct(params?.slug ?? "");
  const { products } = useProducts();

  const { addToCart, toggleFavorite, favorites } = useStore();
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [notified, setNotified] = useState(false);

  const imageCount = product?.images.length ?? 0;

  // Arrow-key navigation between gallery images.
  useEffect(() => {
    if (imageCount < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setActiveImage((i) => (i - 1 + imageCount) % imageCount);
      else if (e.key === "ArrowRight") setActiveImage((i) => (i + 1) % imageCount);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imageCount]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-sans text-sm text-muted-foreground">Cargando producto…</span>
      </div>
    );
  }
  if (!product) return <NotFound />;

  const goPrev = () => setActiveImage((i) => (i - 1 + imageCount) % imageCount);
  const goNext = () => setActiveImage((i) => (i + 1) % imageCount);

  const isFavorite = favorites.includes(product.id);
  const outOfStock = productStock(product) <= 0;
  const selectedOut = selectedSize !== null && !isSizeAvailable(product, selectedSize);
  const similar = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 8);

  const handleAdd = () => {
    if (!selectedSize || selectedOut) return;
    // ponytail: cart line doesn't carry size/color yet — needs a variant-aware
    // cart model (arrives with checkout, PLAN task 7). Gating fixes the UX bug.
    addToCart(product.id);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Ropa", href: "/search" },
              { label: product.category, href: `/search?category=${product.category}` },
              { label: product.name },
            ]}
          />
        </div>

        <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
          {/* Gallery — thumbnails + main image */}
          <div className="w-full md:w-3/5 flex flex-col-reverse md:flex-row gap-3">
            <div className="flex md:flex-col gap-2 md:gap-3">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`w-16 h-20 md:w-20 md:h-24 flex-none overflow-hidden bg-muted border transition-colors ${
                    activeImage === i ? "border-foreground" : "border-transparent hover:border-border"
                  }`}
                  aria-label={`Ver imagen ${i + 1}`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover object-center" />
                </button>
              ))}
            </div>

            {/* Main image — contained (max-width + 4/5 ratio), soft centered hover zoom.
                Click opens the lightbox; arrows/keys switch images. */}
            <div className="group relative flex-1 md:max-w-[460px] aspect-[4/5] overflow-hidden bg-muted">
              <img
                src={product.images[activeImage]}
                alt={product.name}
                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
              />
              <button
                type="button"
                onClick={() => setZoom(true)}
                className="absolute inset-0 cursor-zoom-in"
                aria-label={`Ampliar imagen de ${product.name}`}
              />
              {imageCount > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Imagen anterior"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md text-foreground hover:bg-background transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Imagen siguiente"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md text-foreground hover:bg-background transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Info panel */}
          <div className="w-full md:w-2/5 flex flex-col gap-5">
            <h1 className="font-sans font-bold text-2xl md:text-3xl uppercase tracking-wide text-foreground leading-tight">{product.name}</h1>

            <span className="font-sans text-2xl text-foreground">{product.price}</span>

            {/* Colors */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-sans font-bold text-foreground">
                Color: <span className="font-normal text-muted-foreground">{product.colors[selectedColor]?.name}</span>
              </span>
              <div className="flex items-center gap-3">
                {product.colors.map((color, i) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => setSelectedColor(i)}
                    aria-label={color.name}
                    className={`w-8 h-8 rounded-full border transition-all ${
                      selectedColor === i ? "ring-2 ring-offset-2 ring-primary border-transparent" : "border-border"
                    }`}
                    style={{ backgroundColor: color.hex }}
                    data-testid={`swatch-${color.name}`}
                  />
                ))}
              </div>
            </div>

            <span className="text-xs font-sans font-bold uppercase tracking-widest text-muted-foreground">
              Ajuste: {product.fit}
            </span>

            {/* Sizes — sold-out sizes shown disabled, not hidden */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-sans font-bold text-foreground">Talla</span>
                <button
                  type="button"
                  onClick={() => setSizeGuideOpen(true)}
                  className="text-sm font-sans text-primary hover:underline"
                >
                  Tabla de medidas
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const available = v.stock > 0;
                  const selected = selectedSize === v.size;
                  return (
                    <button
                      key={v.size}
                      type="button"
                      onClick={() => { setSelectedSize(v.size); setNotified(false); }}
                      className={`min-w-[3rem] px-4 py-2 border font-sans font-bold text-sm transition-all ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : available
                          ? "bg-background text-foreground border-border hover:border-primary"
                          : "bg-muted text-muted-foreground border-border line-through"
                      }`}
                      data-testid={`size-${v.size}`}
                      aria-label={available ? v.size : `${v.size} agotado`}
                    >
                      {v.size}
                    </button>
                  );
                })}
              </div>
              {selectedSize === null && !outOfStock && (
                <span className="text-xs font-sans text-muted-foreground">Elige una talla para continuar.</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2">
              {selectedOut ? (
                <button
                  type="button"
                  onClick={() => setNotified(true)}
                  disabled={notified}
                  className="flex-grow border-2 border-primary text-primary font-sans font-bold text-base py-4 hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-60"
                  data-testid="button-notify-stock"
                >
                  {notified ? "Te avisaremos ✓" : "Avísame cuando haya stock"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={outOfStock || !selectedSize}
                  className="flex-grow bg-primary text-primary-foreground font-sans font-bold text-base uppercase tracking-wider py-4 hover:bg-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
                  data-testid="button-add-bag"
                >
                  {outOfStock ? "Agotado" : !selectedSize ? "Elige una talla" : "Agregar a la bolsa"}
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleFavorite(product.id)}
                aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                className="flex-none w-14 h-14 flex items-center justify-center rounded-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                data-testid="button-favorite-detail"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                </svg>
              </button>
            </div>

            {/* Paolo — virtual stylist, not shipped yet */}
            <button
              type="button"
              disabled
              className="flex items-center justify-center gap-2 w-full border border-border text-muted-foreground font-sans font-bold text-sm py-3 cursor-not-allowed"
              data-testid="button-paolo"
            >
              Probar con Paolo
              <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5">En desarrollo</span>
            </button>

            {/* Details */}
            <div className="border-t border-border pt-5 mt-2">
              <h2 className="font-sans font-bold text-base uppercase tracking-wide text-foreground mb-2">Detalles del producto</h2>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">{product.details}</p>
            </div>
          </div>
        </div>

        {/* Similar products */}
        {similar.length > 0 && (
          <section className="mt-16">
            <h2 className="font-sans font-bold text-xl md:text-2xl uppercase tracking-wide text-foreground mb-6">También te puede gustar</h2>
            <ProductCarousel>
              {similar.map((p) => (
                <div key={p.id} className="w-40 md:w-56 flex-none">
                  <ProductCard product={p} />
                </div>
              ))}
            </ProductCarousel>
          </section>
        )}
      </div>

      {/* Image lightbox */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-3xl p-2 bg-background border-border">
          <DialogTitle className="sr-only">{product.name}</DialogTitle>
          <img
            src={product.images[activeImage]}
            alt={product.name}
            className="w-full h-auto max-h-[80vh] object-contain"
          />
        </DialogContent>
      </Dialog>

      {/* Size guide */}
      <Dialog open={sizeGuideOpen} onOpenChange={setSizeGuideOpen}>
        <DialogContent className="max-w-md bg-background border-border">
          <DialogTitle className="font-sans font-bold text-lg uppercase tracking-wide">Tabla de medidas</DialogTitle>
          <div className="overflow-x-auto hide-scrollbar">
            <table className="w-full text-sm font-sans text-foreground">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-bold">Talla</th>
                  <th className="py-2 pr-4 font-bold">Busto (cm)</th>
                  <th className="py-2 font-bold">Cintura (cm)</th>
                </tr>
              </thead>
              <tbody>
                {ALL_SIZES.filter((s) => s !== "Único").map((s, i) => (
                  <tr key={s} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-bold">{s}</td>
                    <td className="py-2 pr-4">{80 + i * 4}–{83 + i * 4}</td>
                    <td className="py-2">{60 + i * 4}–{63 + i * 4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Medidas referenciales. Si estás entre dos tallas, elige la mayor.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
