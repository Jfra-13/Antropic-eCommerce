import { Link } from "wouter";
import { useProducts, useCategories } from "../lib/catalog";
import { useStoreConfig } from "../lib/config";
import { ProductCard } from "../components/ProductCard";
import { ProductCarousel } from "../components/ProductCarousel";
import { CategoryPills } from "../components/CategoryPills";
import modelo_01 from "../assets/modelo_01.webp";
import modelo_02 from "../assets/modelo_02.webp";

export default function Home() {
  // The API orders featured products first, so the top 8 are the "most wanted".
  const { products } = useProducts();
  const { categories } = useCategories();
  const { config } = useStoreConfig();

  // Banners are managed in the admin panel: the first active one takes over the hero
  // image; the rest render as a promo strip. No banners = bundled fallback art.
  const banners = config?.banners ?? [];
  const heroImage = banners[0]?.imageUrl ?? modelo_01;
  const promoBanners = banners.slice(1);

  const mostWanted = products.slice(0, 8);
  const categoryPills = categories.map((c) => ({ label: c.name, value: c.name }));

  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero — one strong color block, 3-level type hierarchy */}
      <section className="flex flex-col md:flex-row w-full max-h-[800px] overflow-hidden">
        <div className="md:order-2 w-full md:w-1/2 h-[60vw] md:h-[600px] relative bg-muted">
          <img src={heroImage} alt="Nueva colección" className="w-full h-full object-cover object-top" />
        </div>
        <div className="md:order-1 w-full md:w-1/2 bg-primary text-primary-foreground flex flex-col justify-center items-center md:items-start text-center md:text-left p-12 md:p-20 lg:p-24">
          <span className="font-sans text-sm uppercase tracking-[0.25em] mb-4 text-primary-foreground/80">Nueva colección</span>
          <h1 className="font-sans font-bold text-5xl md:text-6xl lg:text-7xl uppercase leading-none mb-8">Verano<br />2025</h1>
          <Link href="/search" className="inline-block bg-background text-foreground font-sans font-bold text-sm uppercase tracking-wider px-8 py-4 hover:bg-foreground hover:text-background transition-colors">
            Comprar ahora
          </Link>
        </div>
      </section>

      {/* 2. Category quick-filter pills (no repeated imagery) */}
      <section className="py-8 px-4 max-w-6xl mx-auto">
        <CategoryPills items={categoryPills} hrefFor={(v) => `/search?category=${v}`} />
      </section>

      {/* Promo banners from the admin panel */}
      {promoBanners.length > 0 && (
        <section className="px-4 max-w-6xl mx-auto flex flex-col gap-4">
          {promoBanners.map((b) => (
            <Link key={b.imageUrl} href="/search" className="block overflow-hidden">
              <img
                src={b.imageUrl}
                alt="Promoción"
                className="w-full max-h-72 object-cover hover:scale-[1.02] transition-transform duration-500"
              />
            </Link>
          ))}
        </section>
      )}

      {/* 3. Editorial feature — neutral bg, inverted split, color in accents only */}
      <section className="w-full bg-muted py-16 px-4 md:px-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row-reverse items-center gap-10">
          <div className="w-full md:w-1/2">
            <div className="aspect-[4/5] md:aspect-square overflow-hidden">
              <img src={modelo_02} alt="Estilo único" className="w-full h-full object-cover object-center" />
            </div>
          </div>
          <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left text-foreground">
            <span className="font-sans text-sm uppercase tracking-[0.25em] text-primary mb-4">Editorial</span>
            <h2 className="font-sans font-bold text-4xl md:text-5xl uppercase leading-tight mb-4">Estilo que habla por ti</h2>
            <p className="font-sans text-lg text-muted-foreground mb-8">Descubre piezas únicas diseñadas para ti.</p>
            <Link href="/search" className="inline-block bg-foreground text-background font-sans font-bold text-sm uppercase tracking-wider px-8 py-4 hover:bg-primary hover:text-primary-foreground transition-colors">
              Ver colección
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Most wanted — 8 items, horizontal carousel */}
      <section className="py-16 px-4 md:px-6 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <h2 className="font-sans font-bold text-2xl md:text-3xl uppercase tracking-wide text-foreground">Lo más deseado</h2>
          <Link href="/search" className="font-sans text-sm font-bold text-primary hover:underline whitespace-nowrap">Ver todo</Link>
        </div>
        <ProductCarousel>
          {mostWanted.map((product) => (
            <div key={product.id} className="w-44 md:w-64 flex-none">
              <ProductCard product={product} showPrice={false} />
            </div>
          ))}
        </ProductCarousel>
      </section>
    </div>
  );
}
