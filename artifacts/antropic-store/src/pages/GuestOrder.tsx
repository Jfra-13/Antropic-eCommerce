import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetGuestOrder,
  getGetGuestOrderQueryKey,
  useCreateGuestPaymentProofUploadUrl,
  useAttachGuestPaymentProof,
} from "@workspace/api-client-react";
import { useStore } from "../context/StoreContext";
import { OrderView, type ProofActions } from "../components/OrderView";
import { guestOrderRequest, guestOrderToken, rememberGuestOrder } from "../lib/guest-orders";
import { useSeo } from "../lib/seo";

const VERIFICATION_POLL_MS = 5000;

// A guest order (auditoría §1.4), opened with its access token instead of a session. The token
// arrives in the #fragment of the email link — never in the path or query, so it is not sent to
// the storefront host nor leaked through Referer — or comes from this browser's memory of the
// orders it placed.
export default function GuestOrder() {
  useSeo({ title: "Tu pedido", noindex: true });
  const [, params] = useRoute("/pedido/:id");
  const orderId = params?.id ?? "";
  const { user } = useStore();

  // Read without side effects: the fragment wins over what this browser remembered.
  const [token, setToken] = useState<string | null>(() => {
    const fromLink = window.location.hash.slice(1);
    return fromLink || (orderId ? guestOrderToken(orderId) : null);
  });

  // Pasting the emailed link into a tab already showing this page only changes the fragment:
  // no navigation, no remount, so the initial read above would never see the new token.
  useEffect(() => {
    const onHashChange = () => {
      const fromLink = window.location.hash.slice(1);
      if (fromLink) setToken(fromLink);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Keep it for the return visit, then take it out of the address bar: an address gets copied,
  // screenshotted and pasted into chats, and the order should not travel with it.
  useEffect(() => {
    if (!token || !orderId || !window.location.hash) return;
    rememberGuestOrder(orderId, token);
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
  }, [token, orderId]);

  const request = token ? guestOrderRequest(token) : undefined;
  const { data: order, isLoading, isError } = useGetGuestOrder(orderId, {
    request,
    query: {
      // The token is part of the key: a new one (pasted link, hashchange) must refetch rather
      // than reuse a cached 404 from the previous token. It stays in memory only.
      queryKey: [...getGetGuestOrderQueryKey(orderId), token],
      enabled: !!token && orderId.length > 0,
      // A wrong or stale link is a 404 that no retry will fix.
      retry: false,
      // Poll while the constancia is being reviewed so "pago confirmado" appears alone.
      refetchInterval: (query) =>
        query.state.data?.paymentStatus === "en_verificacion" ? VERIFICATION_POLL_MS : false,
    },
  });
  const proof = useGuestProof(orderId, request);

  if (!token) {
    return (
      <Centered>
        <p className="font-sans text-foreground font-bold mb-2">Abre el enlace de tu correo</p>
        <p className="font-sans text-sm text-muted-foreground max-w-md">
          Para ver un pedido hecho sin cuenta, usa el botón «Ver mi pedido» del correo de
          confirmación que te enviamos. Si compraste con tu cuenta,{" "}
          <Link href="/login" className="text-primary underline">inicia sesión</Link>.
        </p>
      </Centered>
    );
  }
  if (isLoading) return <Centered>Cargando tu pedido…</Centered>;
  if (isError || !order) {
    return (
      <Centered>
        <p className="font-sans text-foreground font-bold mb-2">No pudimos abrir este pedido</p>
        <p className="font-sans text-sm text-muted-foreground max-w-md">
          El enlace no es válido o está incompleto. Vuelve a abrirlo desde el correo de
          confirmación, o escríbenos y lo buscamos.
        </p>
      </Centered>
    );
  }

  const delivered = order.fulfillmentStatus === "entregado" || order.fulfillmentStatus === "recogido";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4 md:px-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <OrderView order={order} proof={proof} />

        {!user && (
          <div className="border border-border p-6 flex flex-col gap-2">
            <p className="font-sans text-sm text-foreground font-bold">
              Guarda este enlace o el correo de confirmación
            </p>
            <p className="font-sans text-sm text-muted-foreground">
              Compraste sin cuenta, así que es la forma de volver a tu pedido.{" "}
              {delivered
                ? "Para pedir un cambio o devolución, "
                : "Si quieres ver todos tus pedidos en un solo lugar, "}
              <Link href="/login" className="text-primary underline">
                ingresa con el mismo correo
              </Link>{" "}
              y este pedido aparecerá en tu cuenta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// The constancia calls for a guest order, authorised by its access token.
function useGuestProof(orderId: string, request: RequestInit | undefined): ProofActions {
  const queryClient = useQueryClient();
  const createUploadUrl = useCreateGuestPaymentProofUploadUrl({ request });
  const attachProof = useAttachGuestPaymentProof({ request });
  return {
    requestUpload: () => createUploadUrl.mutateAsync({ id: orderId }),
    attach: (path, amountReported) =>
      attachProof.mutateAsync({ id: orderId, data: { path, amountReported } }),
    refresh: () => queryClient.invalidateQueries({ queryKey: getGetGuestOrderQueryKey(orderId) }),
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4 font-sans text-muted-foreground">
      {children}
    </div>
  );
}
