import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Staff sign-in: Google OAuth (one tap) or Magic Link (passwordless email), matching the
// customer auth decision (requerimientos §1). No passwords are stored anywhere.
export default function Login({ error }: { error?: string | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const redirectTo = window.location.origin + window.location.pathname;

  async function signInGoogle() {
    setLocalError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setLocalError(error.message);
      setBusy(false);
    }
  }

  async function signInMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) {
      setLocalError(error.message);
      return;
    }
    setSent(true);
  }

  const shownError = localError ?? error ?? null;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">ANTROPIC</h1>
          <p className="text-sm text-slate-500 mt-1">Backoffice</p>
        </div>

        {shownError && (
          <div className="mb-5 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200">
            {shownError}
          </div>
        )}

        {sent ? (
          <p className="text-sm text-slate-600 text-center">
            Te enviamos un enlace de acceso a <strong>{email}</strong>. Revisá tu correo.
          </p>
        ) : (
          <>
            <button
              onClick={signInGoogle}
              disabled={busy}
              className="w-full rounded-md border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Continuar con Google
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              <span>o</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={signInMagicLink} className="flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@antropic.com"
                className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? "Enviando…" : "Enviar enlace de acceso"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
