import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useStoreConfig } from "../lib/config";

// Shown when the admin has not configured any FAQ entries — the page never renders empty.
const DEFAULT_FAQ = [
  {
    question: "¿Cuánto demora el envío?",
    answer:
      "Los pedidos con delivery en La Molina se entregan en 24 a 48 horas después de confirmado el pago. Te avisamos por correo en cada cambio de estado.",
  },
  {
    question: "¿Cómo pago con Yape?",
    answer:
      "Al finalizar tu pedido verás el número y el QR de Yape. Realiza el pago, sube tu constancia y nuestro equipo la verifica para confirmar tu pedido.",
  },
  {
    question: "¿Puedo cambiar o devolver un producto?",
    answer:
      "Sí. Cuando tu pedido figure como entregado o recogido, puedes solicitar un cambio o devolución desde el detalle del pedido en tu perfil. Revisa la política completa en la página de cambios y devoluciones.",
  },
  {
    question: "¿Cómo elijo mi talla?",
    answer:
      "Cada producto muestra sus tallas disponibles y el stock por talla. Si estás entre dos tallas, te recomendamos elegir la mayor. Ante cualquier duda, escríbenos por WhatsApp antes de comprar.",
  },
  {
    question: "¿Puedo recoger mi pedido en tienda?",
    answer:
      "Sí. Al finalizar tu compra elige la opción de recojo en tienda y selecciona el punto que prefieras. Te avisamos cuando tu pedido esté listo para recoger.",
  },
];

export default function Faq() {
  const { config } = useStoreConfig();
  const entries = config?.faq && config.faq.length > 0 ? config.faq : DEFAULT_FAQ;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
      <h1 className="font-display text-4xl text-foreground mb-2">Preguntas frecuentes</h1>
      <p className="font-sans text-sm text-muted-foreground mb-8">
        Todo lo que necesitas saber antes y después de tu compra.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {entries.map((entry, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="font-sans font-semibold">
              {entry.question}
            </AccordionTrigger>
            <AccordionContent className="font-sans text-muted-foreground whitespace-pre-line">
              {entry.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
