import { Link } from "wouter";
import { useStoreConfig } from "../lib/config";

// Shown when the admin has not configured a policy — the page never renders empty.
const DEFAULT_POLICY = `Aceptamos cambios y devoluciones dentro de los 7 días de recibido tu pedido.

El producto debe estar sin uso, con sus etiquetas y en su empaque original. Los cambios están sujetos al stock disponible; las devoluciones se gestionan como reembolso o nota de crédito según el caso.

Los productos en oferta final no tienen cambio, salvo defecto de fábrica.`;

const STEPS = [
  {
    title: "Abre tu pedido",
    detail: "Entra a tu perfil y abre el pedido entregado o recogido que quieres cambiar.",
  },
  {
    title: "Solicita el cambio",
    detail: "Usa la opción de cambios y devoluciones del pedido y cuéntanos el motivo.",
  },
  {
    title: "Nosotros te contactamos",
    detail: "Nuestro equipo revisa tu solicitud y coordina contigo el cambio o la devolución.",
  },
];

export default function Returns() {
  const { config } = useStoreConfig();
  const policy = config?.returnsPolicy ?? DEFAULT_POLICY;
  const whatsapp = config?.contact.whatsappNumber;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
      <h1 className="font-display text-4xl text-foreground mb-2">Cambios y devoluciones</h1>
      <p className="font-sans text-sm text-muted-foreground mb-8">
        Queremos que ames lo que pediste — y si no, lo resolvemos.
      </p>

      <div className="font-sans text-sm text-foreground/90 leading-relaxed whitespace-pre-line mb-10">
        {policy}
      </div>

      <h2 className="font-sans font-bold text-sm uppercase tracking-wide text-foreground mb-4">
        ¿Cómo funciona?
      </h2>
      <ol className="space-y-4 mb-10">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-4">
            <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <p className="font-sans font-semibold text-sm text-foreground">{step.title}</p>
              <p className="font-sans text-sm text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/profile"
          className="inline-flex items-center bg-primary text-primary-foreground font-sans font-semibold text-sm px-6 py-3 hover:opacity-90 transition-opacity cursor-pointer"
        >
          Ir a mis pedidos
        </Link>
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center border border-border font-sans font-semibold text-sm px-6 py-3 text-foreground hover:bg-muted transition-colors"
          >
            Escríbenos por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
