import { useEffect, useRef, useState } from "react";
import type { Order, PaymentProofUploadUrl } from "@workspace/api-client-react";
import { useStoreConfig } from "../lib/config";
import { formatPrice, priceToNumber } from "../lib/product";
import { fulfillmentStatusLabel, paymentStatusLabel } from "../lib/orders";
import { apiErrorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";

const PROOF_BUCKET = "payment-proofs";

// What an order screen shows about the order itself: where it stands, how to pay, the
// constancia upload and the summary. Shared by the account screen (/orders/:id) and the guest
// screen (/pedido/:id) so the two cannot drift — a customer must read the same instructions
// whether or not they made an account.

// How the constancia reaches the API. Both screens upload the file the same way, straight to
// private Storage with a signed URL; what differs is only what authorises the two API calls
// around it — the session for an account order, the order's access token for a guest order.
export type ProofActions = {
  requestUpload: () => Promise<PaymentProofUploadUrl>;
  attach: (path: string, amountReported: string | null) => Promise<unknown>;
  // Re-read the order once the constancia is attached, so the screen moves to "verificando".
  refresh: () => void;
};

export function OrderView({ order, proof }: { order: Order; proof: ProofActions }) {
  return (
    <>
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
        <PaymentInstructions order={order} proof={proof} />
      )}

      {order.paymentStatus === "expirado" && (
        <div className="border border-border p-6 text-center">
          <p className="font-sans text-foreground font-bold mb-1">Este pedido venció</p>
          <p className="font-sans text-sm text-muted-foreground">
            No recibimos el pago a tiempo, así que liberamos el pedido. Si aún lo quieres,
            vuelve a armarlo desde el carrito — o escríbenos y lo vemos.
          </p>
        </div>
      )}

      {order.paymentStatus === "en_verificacion" && (
        <div className="border border-border p-6 text-center">
          <p className="font-sans text-foreground font-bold mb-1">Estamos verificando tu pago</p>
          <p className="font-sans text-sm text-muted-foreground">
            Recibimos tu constancia. Esta página se actualiza sola cuando confirmemos el pago.
          </p>
        </div>
      )}

      {order.paymentStatus === "pagado" && <FulfillmentNotice order={order} />}

      <OrderSummary order={order} />
    </>
  );
}

type FulfillmentStatus = NonNullable<Order["fulfillmentStatus"]>;

// Post-payment banner copy per fulfillment state, so "preparing your order" stops showing
// on orders already shipped or delivered.
const FULFILLMENT_NOTICES: Record<FulfillmentStatus, { title: string; message: string }> = {
  en_preparacion: {
    title: "¡Pago confirmado! 🎉",
    message: "Estamos preparando tu pedido.",
  },
  enviado: {
    title: "Tu pedido está en camino 🚚",
    message: "Salió de nuestro local hacia la dirección que nos diste.",
  },
  entregado: {
    title: "¡Gracias por tu compra! 💖",
    message: "Tu pedido fue entregado. Esperamos que lo disfrutes.",
  },
  recojo_pendiente: {
    title: "Listo para recoger 🛍️",
    message: "Puedes pasar por el punto de recojo que elegiste.",
  },
  recogido: {
    title: "¡Gracias por tu compra! 💖",
    message: "Confirmamos el recojo de tu pedido. Esperamos que lo disfrutes.",
  },
  cancelado: {
    title: "Pedido cancelado",
    message: "Si crees que es un error, contáctanos y lo coordinamos.",
  },
};

function FulfillmentNotice({ order }: { order: Order }) {
  const notice = order.fulfillmentStatus
    ? FULFILLMENT_NOTICES[order.fulfillmentStatus]
    : { title: "¡Pago confirmado! 🎉", message: "Te avisaremos en cada paso de tu pedido." };
  const celebratory = order.fulfillmentStatus !== "cancelado";

  return (
    <div
      className={`border p-6 text-center ${
        celebratory ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <p className="font-sans text-foreground font-bold mb-1">{notice.title}</p>
      <p className="font-sans text-sm text-muted-foreground">{notice.message}</p>
    </div>
  );
}

// What the customer has to do next depends on how the order is paid, which the server states
// on the order itself (`paymentMethod`) rather than leaving the client to assume. Today there
// is one method; a second one adds a branch here instead of a rewrite of this screen.
function PaymentInstructions({ order, proof }: { order: Order; proof: ProofActions }) {
  switch (order.paymentMethod) {
    case "manual_yape":
      return <ManualYapeInstructions order={order} proof={proof} />;
  }
}

// Yape/Plin manual payment: business number + QR from the admin config, reference code for
// the match, then the customer uploads the constancia (direct to private Storage).
function ManualYapeInstructions({ order, proof }: { order: Order; proof: ProofActions }) {
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

      <ProofUpload proof={proof} />
    </div>
  );
}

// Two-step proof upload: pick the file, review a local preview, THEN confirm and send.
// Nothing leaves the device until the customer confirms.
function ProofUpload({ proof }: { proof: ProofActions }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs leak until revoked; release the previous one on change and on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(f: File) {
    setError(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const upload = await proof.requestUpload();
      const { error: uploadError } = await supabase.storage
        .from(PROOF_BUCKET)
        .uploadToSignedUrl(upload.path, upload.token, file);
      if (uploadError) throw uploadError;
      await proof.attach(upload.path, amount.trim() || null);
      proof.refresh();
      clearFile();
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
          if (f) pickFile(f);
          e.target.value = "";
        }}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider px-6 py-3 hover:bg-foreground transition-colors self-start"
          data-testid="button-upload-proof"
        >
          Elegir constancia de pago
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-sans text-sm text-muted-foreground">
            Revisa que la constancia se vea bien antes de enviarla:
          </p>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Vista previa de la constancia"
              className="max-w-xs max-h-72 object-contain border border-border self-start"
            />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider px-6 py-3 hover:bg-foreground transition-colors disabled:opacity-60"
              data-testid="button-confirm-proof"
            >
              {busy ? "Enviando…" : "Confirmar y enviar"}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="border border-border text-muted-foreground font-sans font-bold text-sm uppercase tracking-wider px-6 py-3 hover:border-foreground hover:text-foreground transition-colors disabled:opacity-60"
            >
              Elegir otra
            </button>
          </div>
        </div>
      )}
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
