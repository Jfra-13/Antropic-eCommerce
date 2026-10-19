import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCheckoutQuote,
  useCreateOrder,
  useListPickupPoints,
  getListPickupPointsQueryKey,
  getGetCartQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useUpdateMe,
  useRecordConsent,
  useGuestCheckoutQuote,
  useCreateGuestOrder,
  type CheckoutQuote,
} from "@workspace/api-client-react";
import { useStore } from "../context/StoreContext";
import { formatPrice, priceToNumber } from "../lib/product";
import { apiErrorCode, apiErrorMessage } from "../lib/errors";
import { useStoreConfig } from "../lib/config";
import { brand } from "@workspace/brand";
import { useSeo } from "../lib/seo";
import { rememberGuestOrder } from "../lib/guest-orders";

type DeliveryMethod = "delivery" | "recojo";

// Deliberately loose: the API validates the address for real. This only keeps the button off
// until the field looks like an email, so a typo is caught before the order, not after.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Checkout() {
  useSeo({ title: "Finalizar compra", noindex: true });
  const { user, authLoading, cart, cartLoading, clearGuestCart } = useStore();
  // Without a session this is a guest checkout (auditoría §1.4): same screen, same server-side
  // totals, plus an email field — the order's way back to the customer, since there is no
  // account to find it in.
  const isGuest = !authLoading && !user;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("delivery");
  const [address, setAddress] = useState("");
  const [pickupPointId, setPickupPointId] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  // Quote failures that are not about the coupon (stock, rate limit, ...). Kept apart from
  // couponError so the guest is not told their coupon is wrong when the cart is.
  const [quoteError, setQuoteError] = useState<{ code: string | undefined; message: string } | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);

  // Contact data: prefilled from the profile; shown as inline inputs when incomplete
  // (the server rejects orders without name + phone — PROFILE_INCOMPLETE).
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saveContact, setSaveContact] = useState(true);
  const [contactError, setContactError] = useState<string | null>(null);
  // Marketing opt-in. Starts UNCHECKED and must stay that way: a pre-ticked box is not consent
  // under the reglamento, it is an infraction. It is also kept separate from placing the order
  // — agreeing to be sold to is never the same act as agreeing to be delivered to.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const prefilled = useRef(false);

  // One key per checkout visit: a double click on "Confirmar" returns the same order.
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  // The key is globally unique, so one minted while logged out (and possibly spent on a guest
  // order) must not be reused by the account path after login: that would be a key conflict.
  const keyForUser = useRef<string | null>(user?.id ?? null);
  if (keyForUser.current !== (user?.id ?? null)) {
    keyForUser.current = user?.id ?? null;
    idempotencyKey.current = crypto.randomUUID();
  }

  const pickupPoints = useListPickupPoints({
    query: { queryKey: getListPickupPointsQueryKey(), enabled: deliveryMethod === "recojo" },
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), enabled: !!user } });
  const accountQuote = useCheckoutQuote();
  const guestQuote = useGuestCheckoutQuote();
  const quoteMutation = isGuest ? guestQuote : accountQuote;
  const updateMe = useUpdateMe();
  const accountOrder = useCreateOrder();
  const guestOrder = useCreateGuestOrder();
  const createOrder = isGuest ? guestOrder : accountOrder;
  const recordConsent = useRecordConsent();
  const { config } = useStoreConfig();

  const profile = me?.user;
  const profileIncomplete = !!profile && (!profile.fullName?.trim() || !profile.phone?.trim());

  // Prefill once when the profile arrives; the user keeps control after that.
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setFullName(profile.fullName ?? "");
    setPhone(profile.phone ?? "");
    if (profile.shippingAddress) setAddress(profile.shippingAddress);
  }, [profile]);

  // What the guest is buying, as the API wants it: variant ids and quantities, never prices.
  const guestItems = cart.map((line) => ({ variantId: line.variantId, quantity: line.qty }));
  const cartKey = guestItems.map((i) => `${i.variantId}:${i.quantity}`).join(",");

  // Server-side totals preview. Re-quoted whenever the method or coupon changes (and, for a
  // guest, whenever the browser-side cart does); a coupon rejected by the API is dropped so
  // the totals always reflect what the order would charge.
  useEffect(() => {
    if (authLoading || cartLoading) return;
    if (isGuest && guestItems.length === 0) return;
    const handlers = {
      onSuccess: (q: CheckoutQuote) => {
        setQuote(q);
        setCouponError(null);
        setQuoteError(null);
      },
      onError: (e: unknown) => {
        const code = apiErrorCode(e);
        if (code === "EMPTY_CART") {
          setLocation("/cart");
          return;
        }
        if (code?.startsWith("COUPON_")) {
          setAppliedCoupon(null);
          setCouponError(apiErrorMessage(e));
          return;
        }
        // No quote means no valid totals: drop the stale one so the button state is honest.
        setQuote(null);
        setQuoteError({ code, message: apiErrorMessage(e) });
      },
    };
    if (isGuest) {
      guestQuote.mutate(
        { data: { items: guestItems, deliveryMethod, couponCode: appliedCoupon } },
        handlers,
      );
    } else {
      accountQuote.mutate({ data: { deliveryMethod, couponCode: appliedCoupon } }, handlers);
    }
    // The mutation objects are recreated per render; re-quote only on real input changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, cartLoading, deliveryMethod, appliedCoupon, isGuest ? cartKey : ""]);

  if (authLoading || cartLoading) {
    return <Centered>Cargando…</Centered>;
  }
  if (cart.length === 0 && !createOrder.isSuccess) {
    setLocation("/cart");
    return null;
  }

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    setCouponError(null);
    setAppliedCoupon(code || null);
  };

  const canConfirm =
    quote !== null &&
    !createOrder.isPending &&
    !updateMe.isPending &&
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    (!isGuest || LOOKS_LIKE_EMAIL.test(email.trim())) &&
    (deliveryMethod === "delivery" ? address.trim().length > 0 : pickupPointId !== "");

  // Record both decisions before placing the order, each against the published version of the
  // legal texts. Best-effort: a consent write must never block a purchase.
  const recordOrderConsents = (consentEmail: string | null) => {
    const policyVersion = config?.legal?.policyVersion;
    if (!policyVersion) return;
    recordConsent.mutate({
      data: { purpose: "pedido", granted: true, policyVersion, email: consentEmail },
    });
    recordConsent.mutate({
      data: { purpose: "marketing", granted: marketingOptIn, policyVersion, email: consentEmail },
    });
  };

  const placement = {
    deliveryMethod,
    shippingAddress: deliveryMethod === "delivery" ? address.trim() : null,
    pickupPointId: deliveryMethod === "recojo" ? pickupPointId : null,
    couponCode: appliedCoupon,
    idempotencyKey: idempotencyKey.current,
  };

  const confirmAsGuest = () => {
    const guestEmail = email.trim();
    recordOrderConsents(guestEmail);
    guestOrder.mutate(
      {
        data: {
          ...placement,
          email: guestEmail,
          fullName: fullName.trim(),
          phone: phone.trim(),
          items: guestItems,
        },
      },
      {
        onSuccess: ({ order, accessToken }) => {
          // Before anything else: without the token this browser could not reopen the order.
          rememberGuestOrder(order.id, accessToken);
          setLocation(`/pedido/${order.id}`);
          clearGuestCart();
        },
      },
    );
  };

  const confirm = async () => {
    if (!canConfirm) return;
    if (isGuest) {
      confirmAsGuest();
      return;
    }
    setContactError(null);
    try {
      // The server requires name + phone on the profile before ordering. Sync it first
      // when it changed; "saveContact" only decides whether the address is kept too.
      const nameChanged = fullName.trim() !== (profile?.fullName ?? "");
      const phoneChanged = phone.trim() !== (profile?.phone ?? "");
      const saveAddress =
        saveContact && deliveryMethod === "delivery" &&
        address.trim() !== (profile?.shippingAddress ?? "");
      if (nameChanged || phoneChanged || saveAddress) {
        await updateMe.mutateAsync({
          data: {
            fullName: nameChanged ? fullName.trim() : undefined,
            phone: phoneChanged ? phone.trim() : undefined,
            shippingAddress: saveAddress ? address.trim() : undefined,
          },
        });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    } catch (e) {
      setContactError(apiErrorMessage(e));
      return;
    }
    recordOrderConsents(profile?.email ?? null);

    accountOrder.mutate(
      { data: placement },
      {
        onSuccess: (order) => {
          // The server cleared the cart inside the order transaction.
          queryClient.setQueryData(getGetCartQueryKey(), { items: [] });
          setLocation(`/orders/${order.id}`);
        },
      },
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-sans font-bold text-3xl md:text-4xl uppercase tracking-wide text-foreground mb-8">Finalizar compra</h1>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Contact + delivery + coupon */}
          <div className="flex-1 flex flex-col gap-8">
            <section>
              <h2 className="font-sans font-bold text-lg uppercase tracking-wide text-foreground mb-4">Tus datos</h2>
              {isGuest && (
                <p className="font-sans text-sm text-muted-foreground mb-3">
                  Compra sin crear una cuenta. ¿Ya tienes una?{" "}
                  <Link href="/login" className="text-primary underline">
                    Inicia sesión
                  </Link>
                  .
                </p>
              )}
              {profileIncomplete && (
                <p className="font-sans text-sm text-muted-foreground mb-3">
                  Necesitamos tu nombre y teléfono para coordinar la entrega.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isGuest && (
                  <div className="sm:col-span-2">
                    <label htmlFor="checkout-email" className="font-sans text-sm font-bold text-foreground mb-1 block">
                      Correo electrónico
                    </label>
                    <input
                      id="checkout-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tucorreo@ejemplo.com"
                      className="w-full bg-muted border-2 border-transparent px-4 py-3 font-sans text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
                      data-testid="input-email"
                    />
                    <p className="font-sans text-xs text-muted-foreground mt-1">
                      Te enviamos aquí la confirmación y el enlace para subir tu constancia de pago.
                    </p>
                  </div>
                )}
                <div>
                  <label className="font-sans text-sm font-bold text-foreground mb-1 block">Nombre completo</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre y apellido"
                    className="w-full bg-muted border-2 border-transparent px-4 py-3 font-sans text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
                    data-testid="input-fullname"
                  />
                </div>
                <div>
                  <label className="font-sans text-sm font-bold text-foreground mb-1 block">Teléfono</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9xx xxx xxx"
                    className="w-full bg-muted border-2 border-transparent px-4 py-3 font-sans text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
                    data-testid="input-phone"
                  />
                </div>
              </div>
              {!isGuest && (
                <label className="flex items-center gap-2 mt-3 font-sans text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveContact}
                    onChange={(e) => setSaveContact(e.target.checked)}
                  />
                  Guardar para próximas compras
                </label>
              )}
              {contactError && <p className="text-xs text-destructive mt-2">{contactError}</p>}
            </section>

            <section>
              <h2 className="font-sans font-bold text-lg uppercase tracking-wide text-foreground mb-4">Entrega</h2>
              <div className="flex gap-3 mb-4">
                <MethodButton
                  active={deliveryMethod === "delivery"}
                  onClick={() => setDeliveryMethod("delivery")}
                  label="Envío a domicilio"
                />
                <MethodButton
                  active={deliveryMethod === "recojo"}
                  onClick={() => setDeliveryMethod("recojo")}
                  label="Recojo en tienda"
                />
              </div>

              {deliveryMethod === "delivery" ? (
                <div>
                  <label className="font-sans text-sm font-bold text-foreground mb-1 block">
                    Dirección de envío ({brand.deliveryZone})
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    placeholder="Calle, número, referencia…"
                    className="w-full bg-muted border-2 border-transparent px-4 py-3 font-sans text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
                    data-testid="input-address"
                  />
                </div>
              ) : (
                <div>
                  <label className="font-sans text-sm font-bold text-foreground mb-1 block">
                    Punto de recojo
                  </label>
                  {pickupPoints.isLoading && (
                    <p className="font-sans text-sm text-muted-foreground">Cargando puntos…</p>
                  )}
                  {pickupPoints.data && pickupPoints.data.items.length === 0 && (
                    <p className="font-sans text-sm text-muted-foreground">
                      No hay puntos de recojo disponibles por ahora.
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {(pickupPoints.data?.items ?? []).map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-start gap-3 border p-3 cursor-pointer transition-colors ${
                          pickupPointId === p.id ? "border-primary" : "border-border"
                        }`}
                      >
                        <input
                          type="radio"
                          name="pickup"
                          checked={pickupPointId === p.id}
                          onChange={() => setPickupPointId(p.id)}
                          className="mt-1"
                        />
                        <span className="font-sans text-sm">
                          <span className="font-bold text-foreground block">{p.name}</span>
                          <span className="text-muted-foreground">{p.address}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-sans font-bold text-lg uppercase tracking-wide text-foreground mb-4">Cupón de descuento</h2>
              <div className="flex gap-2">
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
                  disabled={quoteMutation.isPending}
                  className="font-sans font-bold text-sm bg-foreground text-background px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                  data-testid="button-apply-coupon"
                >
                  Aplicar
                </button>
              </div>
              {couponError && <p className="text-xs text-destructive mt-2">{couponError}</p>}
              {quote?.couponCode && (
                <p className="text-xs text-primary mt-2">
                  Cupón {quote.couponCode} aplicado.{" "}
                  <button
                    type="button"
                    onClick={() => { setAppliedCoupon(null); setCouponInput(""); }}
                    className="underline"
                  >
                    Quitar
                  </button>
                </p>
              )}
            </section>
          </div>

          {/* Summary (server-side quote) */}
          <div className="w-full lg:w-96 flex-shrink-0">
            <div className="border border-border p-6 md:p-8 sticky top-24">
              <h2 className="font-sans font-bold text-xl uppercase tracking-wide text-foreground mb-6">Tu pedido</h2>

              {quoteMutation.isPending && !quote && (
                <p className="font-sans text-sm text-muted-foreground">Calculando totales…</p>
              )}

              {quote && (
                <>
                  <div className="flex flex-col gap-2 mb-4">
                    {quote.items.map((item) => (
                      <div key={item.variantId} className="flex justify-between font-sans text-sm">
                        <span className="text-muted-foreground">
                          {item.quantity}× {item.name} <span className="text-xs">({item.variantLabel})</span>
                        </span>
                        <span className="text-foreground">{formatPrice(priceToNumber(item.lineTotal))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 font-sans text-base border-t border-border pt-4">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatPrice(priceToNumber(quote.subtotal))}</span>
                    </div>
                    {priceToNumber(quote.discountAmount) > 0 && (
                      <div className="flex justify-between text-primary">
                        <span>Descuento</span>
                        <span>-{formatPrice(priceToNumber(quote.discountAmount))}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Envío</span>
                      <span>
                        {priceToNumber(quote.shippingCost) === 0
                          ? "Gratis"
                          : formatPrice(priceToNumber(quote.shippingCost))}
                      </span>
                    </div>
                    <div className="border-t border-border my-1" />
                    <div className="flex justify-between font-bold text-xl text-foreground">
                      <span>Total</span>
                      <span>{formatPrice(priceToNumber(quote.total))}</span>
                    </div>
                  </div>
                </>
              )}

              {quoteError && (
                <p className="text-sm text-destructive mt-4">
                  {quoteError.message}
                  {quoteError.code === "OUT_OF_STOCK" && (
                    <>
                      {" "}
                      <Link href="/cart" className="underline">
                        Revisa tu carrito
                      </Link>
                      .
                    </>
                  )}
                </p>
              )}

              {createOrder.isError && (
                <p className="text-sm text-destructive mt-4">{apiErrorMessage(createOrder.error)}</p>
              )}

              <label className="flex items-start gap-2 mt-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="font-sans text-xs text-muted-foreground leading-relaxed">
                  Quiero recibir novedades y promociones por correo. Es opcional: tu pedido se
                  procesa igual si no lo marcas.
                </span>
              </label>

              <button
                onClick={confirm}
                disabled={!canConfirm}
                className="w-full mt-4 bg-primary text-primary-foreground font-sans font-bold text-base uppercase tracking-wider py-4 hover:bg-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-confirm-order"
              >
                {createOrder.isPending ? "Creando pedido…" : "Confirmar pedido"}
              </button>
              <p className="font-sans text-xs text-muted-foreground text-center mt-4">
                Luego de confirmar te mostramos los datos para pagar con Yape/Plin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MethodButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-2 px-4 py-3 font-sans font-bold text-sm transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-border text-muted-foreground hover:border-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center font-sans text-muted-foreground">
      {children}
    </div>
  );
}
