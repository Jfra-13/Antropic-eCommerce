import { Link } from "wouter";
import { useStoreConfig } from "../lib/config";
import { useSeo } from "../lib/seo";

// Privacy policy, terms of sale and cookie policy. The text is NOT hardcoded here: it comes
// from store settings, editable in the backoffice.
//
// Two reasons, and both matter. First, this codebase is going to be forked into a second brand,
// and legal copy baked into JSX turns every clone into a find-and-replace. Second, these are
// documents a lawyer has to review and the business has to be able to correct — needing a
// deploy to fix a legal text is how legal texts stay wrong.
//
// When a text is unset the page says so plainly instead of rendering plausible-looking legal
// prose. A placeholder that reads like a real policy is worse than an obvious gap: customers
// would rely on it and the business would believe it is covered.

type LegalKey = "privacyPolicy" | "termsOfService" | "cookiePolicy";

function LegalPage({
  title,
  intro,
  textKey,
  path,
}: {
  title: string;
  intro: string;
  textKey: LegalKey;
  path: string;
}) {
  // Indexable even while the text is unpublished. The page states plainly that the document
  // is not available yet, and that is the honest thing for a crawler to see too; hiding it
  // would only make the gap harder to notice.
  useSeo({ title, description: intro, path });
  const { config, isLoading } = useStoreConfig();
  const text = config?.legal?.[textKey] ?? null;
  const version = config?.legal?.policyVersion;

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
      <h1 className="font-display text-4xl text-foreground mb-2">{title}</h1>
      <p className="font-sans text-sm text-muted-foreground mb-8">{intro}</p>

      {isLoading ? (
        <p className="font-sans text-sm text-muted-foreground">Cargando…</p>
      ) : text ? (
        <>
          <div className="font-sans text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
            {text}
          </div>
          {version && (
            <p className="font-sans text-xs text-muted-foreground mt-8">Versión {version}</p>
          )}
        </>
      ) : (
        <div className="border border-border p-4">
          <p className="font-sans text-sm text-foreground/90">
            Este documento aún no ha sido publicado.
          </p>
          <p className="font-sans text-xs text-muted-foreground mt-2">
            Si necesitas esta información ahora,{" "}
            <Link href="/faq" className="underline">
              escríbenos
            </Link>{" "}
            y te la enviamos.
          </p>
        </div>
      )}
    </div>
  );
}

export function Privacidad() {
  return (
    <LegalPage
      title="Política de privacidad"
      intro="Cómo tratamos tus datos personales, conforme a la Ley N.° 29733 y su reglamento."
      textKey="privacyPolicy"
      path="/privacidad"
    />
  );
}

export function Terminos() {
  return (
    <LegalPage
      title="Términos y condiciones"
      intro="Condiciones de venta aplicables a las compras realizadas en esta tienda."
      textKey="termsOfService"
      path="/terminos"
    />
  );
}

export function Cookies() {
  return (
    <LegalPage
      title="Política de cookies"
      intro="Qué cookies usamos, para qué, y cómo puedes cambiar tu decisión."
      textKey="cookiePolicy"
      path="/cookies"
    />
  );
}
