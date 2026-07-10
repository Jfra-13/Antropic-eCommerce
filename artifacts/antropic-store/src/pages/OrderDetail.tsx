import { useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useCreatePaymentProofUploadUrl,
  useAttachPaymentProof,
  type Order,
} from "@workspace/api-client-react";
import { useStore } from "../context/StoreContext";
import { useStoreConfig } from "../lib/config";
import { formatPrice, priceToNumber } from "../lib/product";
import { fulfillmentStatusLabel, paymentStatusLabel } from "../lib/orders";
import { apiErrorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import NotFound from "./not-found";

const PROOF_BUCKET = "payment-proofs";
const VERIFICATION_POLL_MS = 5000;

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id ?? "";
  const { user, authLoading } = useStore();

  const { data: order, isLoading, isError } = useGetOrder(orderId, {
    query: {
      queryKey: getGetOrderQueryKey(orderId),
      enabled: !!user && orderId.length > 0,
      // Poll while the constancia is being reviewed so "pago confirmado" appears alone.
      refetchInterval: (query) =>
        query.state.data?.paymentStatus === "en_verificacion" ? VERIFICATION_POLL_MS : false,
    },
  });

  if (authLoading || (user && isLoading)) {
    return <Centered>Cargando tu pedido…</Centered>;
  }
  if (!user) {
    return (
      <Centered>
        <Link href="/login" className="text-primary underline">Inicia sesión</Link>
        <span className="ml-1">para ver tu pedido.</span>
      </Centered>
    );
  }
  if (isError || !order) return <NotFound />;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4 md:px-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div>
          <p className="font-sans text-sm text-muted-foreground">
            Pedido #{order.orderNumber} · {new Date(order.createdAt).toLocaleDateString()}
          </p>
          <h1 className="font-sans font-bold text-2xl md:text-3xl uppercase tracking-wide text-foreground mt-1">
            {order.paymentStatus === "pagado" && order.fulfillmentStatus
              ? fulfillmentStatusLabel(order.fulfillmentStatus)
              : paymentStatusLabel(order.paymentStatus)}
          </h1>
        </div>

        {(order.paymentStatus === "pendiente_pago" || order.paymentStatus === "rechazado") && (
          <PaymentInstructions order={order} />
        )}

        {order.paymentStatus === "en_verificacion" && (
          <div className="border border-border p-6 text-center">
            <p className="font-sans text-foreground font-bold mb-1">Estamos verificando tu pago</p>
            <p className="font-sans text-sm text-muted-foreground">
              Recibimos tu constancia. Esta página se actualiza sola cuando confirmemos el pago.
            </p>
          </div>
        )}

        {order.paymentStatus === "pagado" && (
          <div className="border border-primary/40 bg-primary/5 p-6 text-center">
            <p className="font-sans text-foreground font-bold mb-1">¡Pago confirmado! 🎉</p>
            <p className="font-sans text-sm text-muted-foreground">
              {order.deliveryMethod === "delivery"
                ? "Estamos preparando tu pedido para el envío."
                : "Te avisamos cuando esté listo para recoger."}
            </p>
          </div>
        )}

        <OrderSummary order={order} />

        <Link href="/profile" className="font-sans text-sm text-primary hover:underline">
          ← Volver a mis pedidos
        </Link>
      </div>
    </div>
  );
}

// Yape/Plin manual payment: business number + QR from the admin config, reference code for
// the match, then the customer uploads the constancia (direct to private Storage).
function PaymentInstructions({ order }: { order: Order }) {
  const { config } = useStoreConfig();

  return (
    <div className="border border-border p-6 flex flex-col gap-5">
      {order.paymentStatus === "rechazado" && (
        <div className="bg-destructive/10 text-destructive font-sans text-sm px-4 py-3 border border-destructive/30">
          Tu constancia fue rechazada. Verifica el monto y vuelve a subirla, o contáctanos.
        </div>
      )}

      <div>
        <h2 className="font-sans font-bold text-lg uppercase tracking-wide text-foreground mb-2">
          Paga {formatPrice(priceToNumber(order.total))} con Yape o Plin
        </h2>
        <ol className="font-sans text-sm text-muted-foreground list-decimal ml-5 flex flex-col gap-1">
          <li>
            Yapea al número{" "}
            <span className="font-bold text-foreground">{config?.yapeNumber ?? "—"}</span>{" "}
            o escanea el QR.
          </li>
          <li>
            En la descripción del Yape escribe el código{" "}
            <span className="font-mono font-bold text-foreground">{order.referenceCode}</span>.
          </li>
          <li>Sube la captura de tu constancia aquí abajo.</li>
        </ol>
      </div>

      {config?.yapeQrUrl && (
        <img
          src={config.yapeQrUrl}
          alt="QR Yape"
          className="w-44 h-44 object-contain border border-border self-center"
        />
      )}

      <ProofUpload orderId={order.id} />
    </div>
  );
}

function ProofUpload({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUploadUrl = useCreatePaymentProofUploadUrl();
  const attachProof = useAttachPaymentProof();

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const upload = await createUploadUrl.mutateAsync({ id: orderId });
      const { error: uploadError } = await supabase.storage
        .from(PROOF_BUCKET)
        .uploadToSignedUrl(upload.path, upload.token, file);
      if (uploadError) throw uploadError;
      await attachProof.mutateAsync({
        id: orderId,
        data: { path: upload.path, amountReported: amount.trim() || null },
      });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="font-sans text-sm font-bold text-foreground mb-1 block">
          Monto yapeado (opcional)
        </label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Ej. 89.90"
          className="w-full max-w-xs bg-muted px-4 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider px-6 py-3 hover:bg-foreground transition-colors disabled:opacity-60 self-start"
        data-testid="button-upload-proof"
      >
        {busy ? "Subiendo constancia…" : "Subir constancia de pago"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="border border-border p-6">
      <h2 className="font-sans font-bold text-lg uppercase tracking-wide text-foreground mb-4">Resumen</h2>
      <div className="flex flex-col gap-2 mb-4">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between font-sans text-sm">
            <span className="text-muted-foreground">
              {item.quantity}× {item.productName}
              {item.variantLabel && <span className="text-xs"> ({item.variantLabel})</span>}
            </span>
            <span className="text-foreground">{formatPrice(priceToNumber(item.lineTotal))}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 font-sans text-sm border-t border-border pt-4">
        <Row label="Subtotal" value={formatPrice(priceToNumber(order.subtotal))} />
        {priceToNumber(order.discountAmount) > 0 && (
          <Row
            label={`Descuento${order.couponCode ? ` (${order.couponCode})` : ""}`}
            value={`-${formatPrice(priceToNumber(order.discountAmount))}`}
            accent
          />
        )}
        <Row
          label="Envío"
          value={priceToNumber(order.shippingCost) === 0 ? "Gratis" : formatPrice(priceToNumber(order.shippingCost))}
        />
        <div className="flex justify-between font-bold text-lg text-foreground border-t border-border pt-2 mt-1">
          <span>Total</span>
          <span>{formatPrice(priceToNumber(order.total))}</span>
        </div>
      </div>
      {order.deliveryMethod === "delivery" && order.shippingAddress && (
        <p className="font-sans text-xs text-muted-foreground mt-4">
          Envío a: {order.shippingAddress}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${accent ? "text-primary" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center font-sans text-muted-foreground">
      {children}
    </div>
  );
}
