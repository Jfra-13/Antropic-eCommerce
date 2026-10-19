import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useCreatePaymentProofUploadUrl,
  useAttachPaymentProof,
  useListMyReturns,
  getListMyReturnsQueryKey,
  useCreateReturn,
  type ReturnTicket,
} from "@workspace/api-client-react";
import { useStore } from "../context/StoreContext";
import { ALL_SIZES } from "../lib/product";
import { apiErrorMessage } from "../lib/errors";
import { OrderView, type ProofActions } from "../components/OrderView";
import NotFound from "./not-found";
import { useSeo } from "../lib/seo";

const VERIFICATION_POLL_MS = 5000;

export default function OrderDetail() {
  useSeo({ title: "Detalle del pedido", noindex: true });
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
  const proof = useAccountProof(orderId);

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
        <OrderView order={order} proof={proof} />

        {(order.fulfillmentStatus === "entregado" || order.fulfillmentStatus === "recogido") && (
          <ReturnSection orderId={order.id} />
        )}

        <Link href="/profile" className="font-sans text-sm text-primary hover:underline">
          ← Volver a mis pedidos
        </Link>
      </div>
    </div>
  );
}

// The constancia calls for an order the session owns.
function useAccountProof(orderId: string): ProofActions {
  const queryClient = useQueryClient();
  const createUploadUrl = useCreatePaymentProofUploadUrl();
  const attachProof = useAttachPaymentProof();
  return {
    requestUpload: () => createUploadUrl.mutateAsync({ id: orderId }),
    attach: (path, amountReported) =>
      attachProof.mutateAsync({ id: orderId, data: { path, amountReported } }),
    refresh: () => queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) }),
  };
}

// Returns/exchanges (§7.6): available once the order is delivered/picked up. One open
// ticket per order — the server enforces it; the UI shows the existing ticket instead.
function ReturnSection({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const params = { orderId };
  const { data: tickets, isLoading } = useListMyReturns(params, {
    query: { queryKey: getListMyReturnsQueryKey(params) },
  });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [currentSize, setCurrentSize] = useState("");
  const [desiredSize, setDesiredSize] = useState("");

  const createReturn = useCreateReturn({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyReturnsQueryKey(params) });
        setOpen(false);
      },
    },
  });

  if (isLoading) return null;
  const ticket = (tickets ?? [])[0];

  return (
    <div className="border border-border p-6">
      <h2 className="font-sans font-bold text-lg uppercase tracking-wide text-foreground mb-3">
        Cambios y devoluciones
      </h2>

      {ticket ? (
        <ReturnTicketCard ticket={ticket} />
      ) : !open ? (
        <div className="flex flex-col items-start gap-2">
          <p className="font-sans text-sm text-muted-foreground">
            ¿La talla no fue la correcta o hubo un problema con tu pedido?
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-2 border-primary text-primary font-sans font-bold text-sm uppercase tracking-wider px-6 py-3 hover:bg-primary hover:text-primary-foreground transition-colors"
            data-testid="button-open-return"
          >
            Solicitar cambio o devolución
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className="font-sans text-sm font-bold text-foreground mb-1 block">Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Cuéntanos qué pasó…"
              className="w-full bg-muted border-2 border-transparent px-4 py-3 font-sans text-sm text-foreground focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <SizeSelect label="Talla actual" value={currentSize} onChange={setCurrentSize} />
            <SizeSelect label="Talla deseada" value={desiredSize} onChange={setDesiredSize} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                createReturn.mutate({
                  data: {
                    orderId,
                    reason: reason.trim() || null,
                    currentSize: currentSize || null,
                    desiredSize: desiredSize || null,
                  },
                })
              }
              disabled={!reason.trim() || createReturn.isPending}
              className="bg-primary text-primary-foreground font-sans font-bold text-sm uppercase tracking-wider px-6 py-3 hover:bg-foreground transition-colors disabled:opacity-50"
              data-testid="button-submit-return"
            >
              {createReturn.isPending ? "Enviando…" : "Enviar solicitud"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-sans text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
          {createReturn.isError && (
            <p className="text-xs text-destructive">{apiErrorMessage(createReturn.error)}</p>
          )}
        </div>
      )}
    </div>
  );
}

const RETURN_STATUS_LABELS: Record<ReturnTicket["status"], string> = {
  nueva: "Recibida — te contactaremos pronto",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
};

function ReturnTicketCard({ ticket }: { ticket: ReturnTicket }) {
  return (
    <div className="bg-muted p-4 flex flex-col gap-1">
      <p className="font-sans font-bold text-foreground">
        Solicitud #{ticket.ticketNumber} · {RETURN_STATUS_LABELS[ticket.status]}
      </p>
      {ticket.reason && (
        <p className="font-sans text-sm text-muted-foreground">Motivo: {ticket.reason}</p>
      )}
      {(ticket.currentSize || ticket.desiredSize) && (
        <p className="font-sans text-sm text-muted-foreground">
          {ticket.currentSize && <>Talla actual: {ticket.currentSize}</>}
          {ticket.currentSize && ticket.desiredSize && " · "}
          {ticket.desiredSize && <>Talla deseada: {ticket.desiredSize}</>}
        </p>
      )}
      <p className="font-sans text-xs text-muted-foreground mt-1">
        Creada el {new Date(ticket.createdAt).toLocaleDateString()}. La coordinación sigue por
        WhatsApp o correo.
      </p>
    </div>
  );
}

function SizeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="font-sans text-sm font-bold text-foreground mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted px-3 py-2.5 font-sans text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">—</option>
        {ALL_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
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
