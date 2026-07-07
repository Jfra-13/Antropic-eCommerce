import { useStore } from "../context/StoreContext";
import { PRODUCTS } from "../data/mockData";
import { ProductCard } from "../components/ProductCard";
import { Link } from "wouter";
import { FlowerIcon } from "../components/ui/icons";

export default function Favorites() {
  const { favorites } = useStore();
  const favoriteProducts = PRODUCTS.filter(p => favorites.includes(p.id));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-12 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="font-serif text-4xl text-foreground mb-8 text-center md:text-left">Mis Favoritos</h1>
        
        {favoriteProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {favoriteProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white shadow-sm border border-border">
            <div className="text-border w-32 h-32 mb-6">
              <FlowerIcon />
            </div>
            <h3 className="font-serif text-3xl text-foreground mb-3">Aún no tienes favoritos</h3>
            <p className="font-sans text-lg text-muted-foreground mb-8 max-w-md">Guarda los artículos que más te gustan dando clic en el corazón para encontrarlos más rápido después.</p>
            <Link 
              href="/search"
              className="inline-block bg-primary text-white font-sans font-bold px-8 py-4 hover:bg-foreground transition-colors shadow-md"
            >
              Descubrir Productos
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
