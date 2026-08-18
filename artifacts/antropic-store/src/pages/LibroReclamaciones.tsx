import { useState, type FormEvent } from "react";
import { useCreateComplaint } from "@workspace/api-client-react";
import type { ComplaintReceipt, CreateComplaintInput } from "@workspace/api-client-react";
import { useStoreConfig } from "../lib/config";

// Libro de Reclamaciones Virtual — Ley 29571, D.S. 011-2011-PCM, ampliado a plataformas
// digitales por la Ley 32495.
//
// Two things about this page are legal requirements rather than design choices, and should not
// be "simplified" later: the form is reachable without an account (requiring one would obstruct
// the right it exists to guarantee), and every field below appears because the Hoja de
// Reclamación must carry it.

type DocumentType = CreateComplaintInput["consumerDocumentType"];

const DOCUMENT_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: "dni", label: "DNI" },
  { value: "ce", label: "Carné de extranjería" },
  { value: "pasaporte", label: "Pasaporte" },
  { value: "ruc", label: "RUC" },
];

const labelClass = "block font-sans text-xs font-semibold uppercase tracking-wide text-foreground mb-1.5";
const inputClass =
  "w-full border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const hintClass = "font-sans text-xs text-muted-foreground mt-1";

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(d);
}

function Receipt({ receipt }: { receipt: ComplaintReceipt }) {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
      <div className="border border-primary/30 bg-primary/5 p-6">
        <h1 className="font-display text-3xl text-foreground mb-2">Registramos tu {receipt.type}</h1>
        <p className="font-sans text-sm text-foreground/90 leading-relaxed">
          Tu hoja quedó registrada con el código{" "}
          <strong className="text-primary">{receipt.code}</strong>. Te enviamos una copia a{" "}
          <strong>{receipt.consumerEmail}</strong> como constancia — guárdala para cualquier
          seguimiento.
        </p>
        <p className="font-sans text-sm text-foreground/90 leading-relaxed mt-3">
          Responderemos a más tardar el <strong>{formatDate(receipt.dueAt)}</strong>, dentro del
          plazo de 30 días calendario que fija la ley.
        </p>
      </div>
      <p className={`${hintClass} mt-6`}>
        Registrar un reclamo no impide acudir a otras vías de solución de controversias ni es
        requisito previo para denunciar ante INDECOPI.
      </p>
    </div>
  );
}

export default function LibroReclamaciones() {
  const { config } = useStoreConfig();
  const business = config?.business;
  const [receipt, setReceipt] = useState<ComplaintReceipt | null>(null);
  const [isMinor, setIsMinor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateComplaint({
    mutation: {
      onSuccess: (data) => {
        setReceipt(data);
        setError(null);
      },
      onError: () =>
        setError(
          "No pudimos registrar tu solicitud. Revisa los campos obligatorios e inténtalo de nuevo.",
        ),
    },
  });

  if (receipt) return <Receipt receipt={receipt} />;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    };
    mutation.mutate({
      data: {
        type: f.get("type") as CreateComplaintInput["type"],
        consumerName: text("consumerName") ?? "",
        consumerDocumentType: f.get("consumerDocumentType") as DocumentType,
        consumerDocumentNumber: text("consumerDocumentNumber") ?? "",
        consumerEmail: text("consumerEmail") ?? "",
        consumerPhone: text("consumerPhone"),
        consumerAddress: text("consumerAddress"),
        isMinor,
        guardianName: isMinor ? text("guardianName") : null,
        itemType: f.get("itemType") as CreateComplaintInput["itemType"],
        itemDescription: text("itemDescription") ?? "",
        itemAmount: text("itemAmount"),
        detail: text("detail") ?? "",
        request: text("request") ?? "",
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
      <h1 className="font-display text-4xl text-foreground mb-2">Libro de Reclamaciones</h1>
      <p className="font-sans text-sm text-muted-foreground mb-8">
        Conforme a la Ley N.° 29571, Código de Protección y Defensa del Consumidor.
      </p>

      {/* Identificación del proveedor: obligatoria en la Hoja de Reclamación. */}
      <section className="border border-border p-4 mb-8">
        <h2 className="font-sans font-bold text-xs uppercase tracking-wide text-foreground mb-2">
          Identificación del proveedor
        </h2>
        {business?.legalName || business?.ruc || business?.fiscalAddress ? (
          <dl className="font-sans text-sm text-foreground/90 space-y-1">
            {business.legalName && <div>Razón social: {business.legalName}</div>}
            {business.tradeName && <div>Nombre comercial: {business.tradeName}</div>}
            {business.ruc && <div>RUC: {business.ruc}</div>}
            {business.fiscalAddress && <div>Domicilio fiscal: {business.fiscalAddress}</div>}
          </dl>
        ) : (
          <p className="font-sans text-sm text-muted-foreground">
            Los datos del proveedor se muestran en la hoja que recibirás por correo.
          </p>
        )}
      </section>

      <form onSubmit={onSubmit} className="space-y-6">
        <fieldset>
          <legend className={labelClass}>Tipo de registro *</legend>
          <div className="space-y-2">
            <label className="flex items-start gap-3 border border-border p-3 cursor-pointer">
              <input type="radio" name="type" value="reclamo" defaultChecked className="mt-1" />
              <span>
                <span className="font-sans text-sm font-semibold text-foreground">Reclamo</span>
                <span className="block font-sans text-xs text-muted-foreground">
                  Disconformidad con el producto o el servicio recibido.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 border border-border p-3 cursor-pointer">
              <input type="radio" name="type" value="queja" className="mt-1" />
              <span>
                <span className="font-sans text-sm font-semibold text-foreground">Queja</span>
                <span className="block font-sans text-xs text-muted-foreground">
                  Malestar respecto de la atención recibida.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-sans font-bold text-xs uppercase tracking-wide text-foreground mb-2">
            Datos del consumidor
          </legend>
          <div>
            <label htmlFor="consumerName" className={labelClass}>Nombre completo *</label>
            <input id="consumerName" name="consumerName" required className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="consumerDocumentType" className={labelClass}>Documento *</label>
              <select id="consumerDocumentType" name="consumerDocumentType" className={inputClass} defaultValue="dni">
                {DOCUMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="consumerDocumentNumber" className={labelClass}>Número *</label>
              <input id="consumerDocumentNumber" name="consumerDocumentNumber" required className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="consumerEmail" className={labelClass}>Correo electrónico *</label>
              <input id="consumerEmail" name="consumerEmail" type="email" required className={inputClass} />
              <p className={hintClass}>Aquí te enviamos la copia de tu hoja.</p>
            </div>
            <div>
              <label htmlFor="consumerPhone" className={labelClass}>Teléfono</label>
              <input id="consumerPhone" name="consumerPhone" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="consumerAddress" className={labelClass}>Domicilio</label>
            <input id="consumerAddress" name="consumerAddress" className={inputClass} />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isMinor}
                onChange={(e) => setIsMinor(e.target.checked)}
              />
              <span className="font-sans text-sm text-foreground">El consumidor es menor de edad</span>
            </label>
            {isMinor && (
              <div className="mt-3">
                <label htmlFor="guardianName" className={labelClass}>
                  Nombre del padre, madre o tutor *
                </label>
                <input id="guardianName" name="guardianName" required className={inputClass} />
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-sans font-bold text-xs uppercase tracking-wide text-foreground mb-2">
            Bien contratado
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="itemType" className={labelClass}>Tipo *</label>
              <select id="itemType" name="itemType" className={inputClass} defaultValue="producto">
                <option value="producto">Producto</option>
                <option value="servicio">Servicio</option>
              </select>
            </div>
            <div>
              <label htmlFor="itemAmount" className={labelClass}>Monto reclamado (S/)</label>
              <input id="itemAmount" name="itemAmount" inputMode="decimal" placeholder="150.00" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="itemDescription" className={labelClass}>Descripción *</label>
            <input
              id="itemDescription"
              name="itemDescription"
              required
              placeholder="Ej. Vestido rosa talla M, pedido ANT-000123"
              className={inputClass}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-sans font-bold text-xs uppercase tracking-wide text-foreground mb-2">
            Detalle
          </legend>
          <div>
            <label htmlFor="detail" className={labelClass}>¿Qué ocurrió? *</label>
            <textarea id="detail" name="detail" required rows={4} className={inputClass} />
          </div>
          <div>
            <label htmlFor="request" className={labelClass}>¿Qué solicitas? *</label>
            <textarea id="request" name="request" required rows={3} className={inputClass} />
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="font-sans text-sm text-destructive">{error}</p>
        )}

        <p className={hintClass}>
          Usamos estos datos únicamente para atender y responder tu registro. No se emplean para
          publicidad ni para nuestra lista de correos.
        </p>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full sm:w-auto bg-primary text-primary-foreground font-sans font-semibold text-sm px-8 py-3 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {mutation.isPending ? "Enviando…" : "Enviar registro"}
        </button>
      </form>
    </div>
  );
}
