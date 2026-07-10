import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { useLocation } from "wouter";

export default function Login() {
  const { signInWithGoogle, sendMagicLink, user } = useStore();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"google" | "magic" | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  if (user) {
    setLocation("/profile");
    return null;
  }

  const handleGoogle = async () => {
    setError(null);
    setSubmitting("google");
    // On success the browser redirects to Google, so we only land here on error.
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setSubmitting(null);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting("magic");
    const result = await sendMagicLink(email);
    setSubmitting(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMagicSent(true);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center px-4 py-12">
      <div className="bg-white w-full max-w-md shadow-xl p-8 md:p-10 border border-border">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-primary mb-2">Antropic</h1>
          <p className="font-serif text-muted-foreground text-lg">Bienvenida a tu estilo</p>
        </div>

        {error && (
          <div className="mb-5 bg-destructive/10 text-destructive text-sm font-sans px-4 py-3 border border-destructive/30">
            {error}
          </div>
        )}

        {magicSent ? (
          <div className="text-center flex flex-col gap-4">
            <div className="bg-muted px-5 py-6 border border-border">
              <p className="font-sans text-foreground">
                Te enviamos un enlace de acceso a
                <br />
                <span className="font-bold text-primary">{email}</span>
              </p>
              <p className="font-sans text-sm text-muted-foreground mt-3">
                Abrí el correo y hacé clic para entrar. Podés cerrar esta pestaña.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setMagicSent(false); setEmail(""); }}
              className="font-sans text-sm text-primary hover:underline"
            >
              Usar otro correo
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting !== null}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-border text-foreground font-sans font-bold text-base py-3.5 hover:border-primary transition-colors disabled:opacity-60"
            >
              <GoogleIcon />
              {submitting === "google" ? "Conectando…" : "Continuar con Google"}
            </button>

            <div className="flex items-center gap-4 my-6">
              <div className="h-px bg-border flex-1" />
              <span className="font-sans text-sm text-muted-foreground">o</span>
              <div className="h-px bg-border flex-1" />
            </div>

            <form onSubmit={handleMagicLink} className="flex flex-col gap-5">
              <div>
                <label className="font-sans text-sm font-bold text-foreground ml-2 mb-1 block">Correo electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-muted border-2 border-transparent px-5 py-3.5 font-sans text-foreground focus:border-primary focus:outline-none transition-colors"
                  placeholder="hola@ejemplo.com"
                />
              </div>
              <button
                type="submit"
                disabled={submitting !== null}
                className="w-full bg-primary text-white font-sans font-bold text-lg py-4 hover:bg-foreground transition-colors shadow-md disabled:opacity-60"
              >
                {submitting === "magic" ? "Enviando…" : "Enviarme un enlace de acceso"}
              </button>
            </form>

            <p className="font-sans text-xs text-muted-foreground text-center mt-6">
              Sin contraseñas. Te enviamos un enlace o entrás con Google.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
