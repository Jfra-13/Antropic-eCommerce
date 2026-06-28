import { useStore } from "../context/StoreContext";
import { PRODUCTS } from "../data/mockData";
import { Link } from "wouter";

export default function Cart() {
  const { cart, updateQty, removeFromCart } = useStore();
  
  const cartItems = cart.map(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    return { ...item, product };
  }).filter(item => item.product !== undefined);

  const subtotal = cartItems.reduce((acc, item) => {
    const price = parseFloat(item.product!.price.replace('$', ''));
    return acc + (price * item.qty);
  }, 0);

  const shipping = subtotal > 50 ? 0 : 5.99;
  const total = subtotal + shipping;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#FDE9E6] py-10 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-serif text-4xl text-[#3d1a24] mb-8">Tu Carrito</h1>
        
        {cartItems.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Cart Items */}
            <div className="flex-1 flex flex-col gap-6">
              {cartItems.map((item) => (
                <div key={item.productId} className="flex gap-4 md:gap-6 bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-[#f0c4d0]">
                  <div className="w-24 h-32 md:w-32 md:h-40 flex-shrink-0 bg-[#f5e0e5] rounded-xl overflow-hidden">
                    <img src={item.product!.image} alt={item.product!.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col flex-grow justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-serif text-lg md:text-xl text-[#3d1a24]">{item.product!.name}</h3>
                        <p className="font-sans text-sm text-[#8a4a5f] mt-1">{item.product!.category}</p>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.productId)}
                        className="text-[#8a4a5f] hover:text-[#EA4C75] p-2"
                        aria-label="Eliminar"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </button>
                    </div>
                    <div className="flex justify-between items-end mt-4">
                      <div className="flex items-center gap-3 bg-[#FDE9E6] rounded-full p-1 border border-[#f0c4d0]">
                        <button 
                          onClick={() => updateQty(item.productId, item.qty - 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-[#EA4C75] shadow-sm"
                        >-</button>
                        <span className="font-sans font-bold text-[#3d1a24] w-4 text-center">{item.qty}</span>
                        <button 
                          onClick={() => updateQty(item.productId, item.qty + 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-[#EA4C75] shadow-sm"
                        >+</button>
                      </div>
                      <span className="font-sans font-bold text-xl text-[#EA4C75]">{item.product!.price}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="w-full lg:w-96 flex-shrink-0">
              <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-[#f0c4d0] sticky top-24">
                <h2 className="font-serif text-2xl text-[#3d1a24] mb-6">Resumen</h2>
                <div className="flex flex-col gap-4 font-sans text-lg mb-6">
                  <div className="flex justify-between text-[#8a4a5f]">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#8a4a5f]">
                    <span>Envío</span>
                    <span>{shipping === 0 ? 'Gratis' : `$${shipping.toFixed(2)}`}</span>
                  </div>
                  {shipping > 0 && (
                    <div className="text-xs text-[#EA4C75] text-right mt- -2">
                      Te faltan ${(50 - subtotal).toFixed(2)} para envío gratis
                    </div>
                  )}
                  <div className="border-t border-[#f0c4d0] my-2"></div>
                  <div className="flex justify-between font-bold text-2xl text-[#3d1a24]">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
                <button className="w-full bg-[#EA4C75] text-white font-sans font-bold text-lg py-4 rounded-full hover:bg-[#3d1a24] transition-colors shadow-md">
                  Proceder al Pago
                </button>
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[#8a4a5f] font-sans">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                   <span>Pago seguro y encriptado</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl shadow-sm border border-[#f0c4d0]">
            <div className="text-[#f0c4d0] mb-6">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <h3 className="font-serif text-3xl text-[#3d1a24] mb-3">Tu carrito está vacío</h3>
            <p className="font-sans text-lg text-[#8a4a5f] mb-8 max-w-md">¡No te quedes sin tus favoritos! Descubre nuestra nueva colección.</p>
            <Link 
              href="/search"
              className="inline-block bg-[#EA4C75] text-white font-sans font-bold px-8 py-4 rounded-full hover:bg-[#3d1a24] transition-colors shadow-md"
            >
              Ir de Compras
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
