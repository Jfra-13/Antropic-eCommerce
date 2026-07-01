import { Link } from "wouter";
import { PRODUCTS, CATEGORIES, categoryImage } from "../data/mockData";
import { ProductCard } from "../components/ProductCard";
import { CategoryCard } from "../components/CategoryCard";
import { FlowerIcon } from "../components/ui/icons";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F8F1EC]">
      {/* 1. Hero Banner */}
      <section className="flex flex-col md:flex-row w-full max-h-[800px] overflow-hidden">
        {/* Image on mobile (top), right on desktop */}
        <div className="md:order-2 w-full md:w-1/2 h-[60vw] md:h-[600px] relative bg-[#F1E6E1]">
          <img 
            src="https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80" 
            alt="Nueva Colección" 
            className="w-full h-full object-cover object-top"
          />
        </div>
        {/* Text area */}
        <div className="md:order-1 w-full md:w-1/2 bg-[#341620] text-white flex flex-col justify-center items-center md:items-start text-center md:text-left p-12 md:p-20 lg:p-24 relative overflow-hidden">
          <div className="absolute top-4 right-4 text-[#C89B5E] opacity-30 w-32 h-32 md:w-48 md:h-48">
             <FlowerIcon />
          </div>
          
          <h2 className="font-serif text-5xl md:text-6xl lg:text-7xl mb-2 relative z-10 leading-tight">NUEVA<br/>COLECCIÓN</h2>
          <p className="font-sans text-xl md:text-2xl mb-8 font-light italic relative z-10 text-[#CE93A0]">Verano 2025</p>
          <Link href="/search" className="inline-block bg-white text-[#341620] font-sans font-bold text-lg px-8 py-4 rounded-full hover:scale-105 hover:shadow-lg transition-all relative z-10">
            COMPRAR AHORA
          </Link>
        </div>
      </section>

      {/* 2. Category Carousel */}
      <section className="py-8 px-4 overflow-hidden relative">
        <div className="max-w-6xl mx-auto overflow-x-auto hide-scrollbar">
          <div className="flex gap-4 md:gap-6 w-max mx-auto pb-4 px-2">
            {CATEGORIES.map(category => (
              <CategoryCard
                key={category}
                label={category}
                image={categoryImage(category)}
                href={`/search?category=${category}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 3. Editorial Feature Section */}
      <section className="w-full bg-[#F8F1EC] border-y border-[#C89B5E]/40 py-16 px-4 md:px-12 mt-4 relative overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-10">
          <div className="w-full md:w-1/2 relative">
            <div className="aspect-[4/5] md:aspect-square overflow-hidden rounded-3xl shadow-xl border border-[#C89B5E]/50">
               <img 
                  src="https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80" 
                  alt="Estilo único" 
                  className="w-full h-full object-cover object-center"
                />
            </div>
            <div className="absolute -bottom-6 -right-6 text-[#C89B5E] w-24 h-24 rotate-12">
               <FlowerIcon />
            </div>
          </div>
          
          <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left text-[#341620]">
            <h2 className="font-serif text-4xl md:text-6xl mb-4 leading-tight">ESTILO QUE HABLA POR TI</h2>
            <p className="font-sans text-xl mb-8">Descubre piezas únicas diseñadas para ti</p>
            <Link href="/search" className="inline-block bg-[#341620] text-white font-sans font-bold px-8 py-4 rounded-full hover:bg-[#B4536E] transition-colors">
              Ver Colección
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Product Grid */}
      <section className="py-20 px-4 md:px-6 max-w-7xl mx-auto relative">
        <div className="flex items-center gap-4 mb-10 justify-center md:justify-start">
          <h2 className="font-serif text-3xl md:text-4xl text-[#B4536E]">LO MÁS DESEADO</h2>
          <div className="text-[#C89B5E] w-8 h-8 hidden md:block">
            <FlowerIcon />
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
          {PRODUCTS.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
