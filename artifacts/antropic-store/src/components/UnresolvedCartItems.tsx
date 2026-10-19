import { useStore } from "../context/StoreContext";

// Guest cart lines the API says are no longer sold. Shown on /cart and /checkout alike, so
// both screens describe the same cart: checkout refuses to proceed while any remain.
export function UnresolvedCartItems({ className = "" }: { className?: string }) {
  const { unresolvedCartItems, removeFromCart } = useStore();
  if (unresolvedCartItems.length === 0) return null;
  return (
    <div className={`text-sm text-destructive ${className}`}>
      <p className="font-bold">Algunos productos de tu carrito ya no están disponibles.</p>
      <p className="mb-2">Quítalos para continuar; no los incluiremos en tu pedido.</p>
      <ul>
        {unresolvedCartItems.map((item) => (
          <li key={item.variantId} className="flex items-center justify-between gap-2">
            <span>Producto no disponible (x{item.qty})</span>
            <button type="button" onClick={() => removeFromCart(item.variantId)} className="underline">
              Quitar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
