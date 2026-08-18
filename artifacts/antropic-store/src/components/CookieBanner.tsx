import { useState } from "react";
import { Link } from "wouter";
import { useRecordConsent } from "@workspace/api-client-react";
import { useStoreConfig } from "../lib/config";
import { readConsent, writeConsent } from "../lib/consent";

// Cookie consent banner.
//
// The reglamento (D.S. 016-2024-JUS) requires real consent, not an "we use cookies" notice, and
// requires refusing to be as easy as accepting. So "Rechazar" is the same size, weight and
// prominence as "Aceptar" — not a muted link tucked under the button. Changing that is a
// compliance regression, not a style tweak.
//
// Nothing here blocks the page: no trackers load before a decision because the storefront has
// none yet, and any future one must gate on hasConsent() in lib/consent.ts.

export function CookieBanner() {
  const { config } = useStoreConfig();
  const policyVersion = config?.legal?.policyVersion;
  const recordConsent = useRecordConsent();

  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Wait for config: recording a decision against an unknown policy version would produce a
  // record that cannot be tied to any text, which is exactly what demonstrability rules out.
  if (!policyVersion || dismissed) return null;

  const existing = readConsent();
  if (existing && existing.policyVersion === policyVersion) return null;

  function decide(nextAnalytics: boolean, nextMarketing: boolean) {
    const version = policyVersion!;
    writeConsent({
      policyVersion: version,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      decidedAt: new Date().toISOString(),
    });
    // One row per purpose: agreeing to analytics is not agreeing to marketing, so they are
    // never recorded as a single decision. Best-effort — a failed write must not trap the
    // visitor behind a banner they already answered.
    recordConsent.mutate({
      data: { purpose: "cookies_analytics", granted: nextAnalytics, policyVersion: version },
    });
    recordConsent.mutate({
      data: { purpose: "cookies_marketing", granted: nextMarketing, policyVersion: version },
    });
    setDismissed(true);
  }

  const buttonBase =
    "font-sans font-semibold text-sm px-6 py-2.5 transition-opacity hover:opacity-90 w-full sm:w-auto";

  return (
    <div
      role="dialog"
      aria-label="Preferencias de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background shadow-lg"
    >
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5">
        <p className="font-sans text-sm text-foreground/90 leading-relaxed">
          Usamos cookies necesarias para que la tienda funcione. Con tu permiso usaríamos también
          cookies de análisis y de publicidad. Puedes aceptarlas, rechazarlas o elegir cuáles.{" "}
          <Link href="/cookies" className="underline">
            Más información
          </Link>
          .
        </p>

        {customizing && (
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked disabled />
              <span className="font-sans text-sm text-muted-foreground">
                Necesarias — siempre activas
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              <span className="font-sans text-sm text-foreground">
                Análisis — para entender cómo se usa la tienda
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              <span className="font-sans text-sm text-foreground">
                Publicidad — para mostrarte anuncios relevantes
              </span>
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Accept and reject are deliberately identical in weight. */}
          <button
            type="button"
            onClick={() => decide(true, true)}
            className={`${buttonBase} bg-primary text-primary-foreground`}
          >
            Aceptar todas
          </button>
          <button
            type="button"
            onClick={() => decide(false, false)}
            className={`${buttonBase} bg-foreground text-background`}
          >
            Rechazar todas
          </button>
          {customizing ? (
            <button
              type="button"
              onClick={() => decide(analytics, marketing)}
              className={`${buttonBase} border border-border text-foreground`}
            >
              Guardar selección
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCustomizing(true)}
              className={`${buttonBase} border border-border text-foreground`}
            >
              Personalizar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
