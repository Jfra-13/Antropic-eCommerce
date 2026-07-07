import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { PRODUCTS, priceToNumber, formatPrice } from "../data/mockData";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ponytail: single demo coupon. Real coupons come from the API — swap this map.
const COUPONS: Record<string, number> = { ANTROPIC10: 0.1 };

type ShippingMode = "envio" | "recojo";

export default function Cart() {
  const { cart, updateQty, removeFromCart } = useStore();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState(false);
  const [shippingMode, setShippingMode] = useState<ShippingMode>("envio");

  const cartItems = cart
    .map((item) => ({ ...item, product: PRODUCTS.find((p) => p.id === item.productId) }))
    .filter((item) => item.product !== undefined);

  const subtotal = cartItems.reduce(
    (acc, item) => acc + priceToNumber(item.product!.price) * item.qty,
    0
  );

  const shipping = shippingMode === "recojo" ? 0 : subtotal > 50 || subtotal === 0 ? 0 : 5.99;
  const discountRate = coupon ? COUPONS[coupon] : 0;
  const discount = subtotal * discountRate;
  const total = subtotal - discount + shipping;

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (COUPONS[code]) {
      setCoupon(code);
      setCouponError(false);
    } else {
      setCoupon(null);
      setCouponError(true);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-sans font-bold text-3xl md:text-4xl uppercase tracking-wide text-foreground mb-8">Tu carrito</h1>

        {cartItems.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Items */}
            <div className="flex-1 flex flex-col gap-4">
              {cartItems.map((item) => (
                <div key={item.productId} className="flex gap-4 md:gap-6 border-b border-border pb-4">
                  <div className="w-24 h-32 md:w-28 md:h-36 flex-shrink-0 bg-muted overflow-hidden">
                    <img src={item.product!.images[0]} alt={item.product!.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col flex-grow justify-between">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-sans font-bold text-base text-foreground">{item.product!.name}</h3>
                        <p className="font-sans text-sm text-muted-foreground mt-1">{item.product!.category}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-muted-foreground hover:text-primary p-2 transition-colors"
                        aria-label="Eliminar"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                      </button>
                    </div>
                    <div className="flex justify-between items-end mt-4">
                      <div className="flex items-center gap-3 bg-muted p-1">
                        <button onClick={() => updateQty(item.productId, item.qty - 1)} className="w-8 h-8 flex items-center justify-center bg-background text-foreground">-</button>
                        <span className="font-sans font-bold text-foreground w-4 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.productId, item.qty + 1)} className="w-8 h-8 flex items-center justify-center bg-background text-foreground">+</button>
                      </div>
                      <span className="font-sans font-bold text-lg text-foreground">{item.product!.price}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="w-full lg:w-96 flex-shrink-0">
              <div className="border border-border p-6 md:p-8 sticky top-24">
                <h2 className="font-sans font-bold text-xl uppercase tracking-wide text-foreground mb-6">Resumen</h2>

                {/* Shipping modality */}
                <label className="font-sans text-sm text-muted-foreground mb-2 block">Entrega</label>
                <Select value={shippingMode} onValueChange={(v) => setShippingMode(v as ShippingMode)}>
                  <SelectTrigger className="w-full border-border bg-background text-foreground font-sans text-sm mb-5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="envio">Envío a domicilio</SelectItem>
                    <SelectItem value="recojo">Recojo en tienda (La Molina)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Coupon */}
                <label className="font-sans text-sm text-muted-foreground mb-2 block">Cupón de descuento</label>
                <div className="flex gap-2 mb-1">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Código"
                    className="flex-grow bg-muted px-4 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-coupon"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    className="font-sans font-bold text-sm bg-foreground text-background px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors"
                    data-testid="button-apply-coupon"
                  >
                    Aplicar
                  </button>
                </div>
                {couponError && <p className="text-xs text-destructive mb-4">Cupón no válido.</p>}
                {coupon && <p className="text-xs text-primary mb-4">Cupón {coupon} aplicado.</p>}
                {!couponError && !coupon && <div className="mb-4" />}

                <div className="flex flex-col gap-3 font-sans text-base mb-6">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-primary">
                      <span>Descuento</span>
                      <span>-{formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Envío</span>
                    <span>{shipping === 0 ? "Gratis" : formatPrice(shipping)}</span>
                  </div>
                  {shippingMode === "envio" && shipping > 0 && (
                    <div className="text-xs text-primary text-right">
                      Te faltan {formatPrice(50 - subtotal)} para envío gratis
                    </div>
                  )}
                  <div className="border-t border-border my-1" />
                  <div className="flex justify-between font-bold text-xl text-foreground">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>

                <button className="w-full bg-primary text-primary-foreground font-sans font-bold text-base uppercase tracking-wider py-4 hover:bg-foreground transition-colors">
                  Proceder al pago
                </button>
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground font-sans">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>Pago seguro y encriptado</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-border">
            <div className="text-border mb-6">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            </div>
            <h3 className="font-sans font-bold text-2xl uppercase text-foreground mb-3">Tu carrito está vacío</h3>
            <p className="font-sans text-lg text-muted-foreground mb-8 max-w-md">¡No te quedes sin tus favoritos! Descubre nuestra nueva colección.</p>
            <Link href="/search" className="inline-block bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider px-8 py-4 hover:bg-foreground transition-colors">
              Ir de compras
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
