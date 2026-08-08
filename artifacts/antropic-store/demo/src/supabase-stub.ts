// Drop-in replacement for `artifacts/antropic-store/src/lib/supabase.ts` in the static
// demo build (swapped in by the resolver plugin in vite.config.ts).
//
// The real client needs a live Supabase project for auth and storage. The demo has no
// backend at all, so this stub keeps the same surface the storefront uses and resolves
// everything locally:
//
//   auth.getSession / onAuthStateChange  -> session held in localStorage
//   auth.signInWithOtp / signInWithOAuth -> sign in immediately, no email round trip
//   storage.getPublicUrl                 -> a data-URI placeholder (demo media is bundled)
//   storage.uploadToSignedUrl            -> accepted no-op (there is nowhere to upload to)
//
// Only the members `grep -rn "supabase\." artifacts/antropic-store/src` reports are
// implemented; anything else is deliberately absent so a new usage fails loudly here
// instead of silently misbehaving in a demo.

const SESSION_KEY = "antropic_demo_session";

type DemoUser = {
  id: string;
  email: string;
  user_metadata: { name: string };
};

// `access_token` matters: main.tsx registers an auth-token getter that reads it, and
// customFetch turns it into the Authorization header the mock API uses to tell a signed-in
// caller from a guest. It is an opaque marker here, not a JWT — nothing verifies it.
type DemoSession = { access_token: string; user: DemoUser } | null;

type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT";
type AuthCallback = (event: AuthEvent, session: DemoSession) => void;

// Stable id so a reload keeps the same "account" (the mock API keys its cart and
// orders by user id).
const DEMO_USER_ID = "00000000-0000-4000-8000-0000000000d0";

function readSession(): DemoSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoSession;
    return parsed?.user?.email ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(session: DemoSession): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

const listeners = new Set<AuthCallback>();

function emit(event: AuthEvent, session: DemoSession): void {
  for (const cb of listeners) cb(event, session);
}

function signIn(email: string): DemoSession {
  const name = email.split("@")[0] ?? "Demo";
  const session: DemoSession = {
    access_token: "demo-session-token",
    user: { id: DEMO_USER_ID, email, user_metadata: { name } },
  };
  writeSession(session);
  emit("SIGNED_IN", session);
  return session;
}

// 1x1 transparent GIF. Media paths that are not one of the bundled demo assets fall
// through to here; a transparent pixel keeps the layout intact without a network hit.
const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: readSession() }, error: null };
    },

    onAuthStateChange(callback: AuthCallback) {
      listeners.add(callback);
      // The real client emits INITIAL_SESSION asynchronously; match that so the
      // storefront's loading state resolves the same way.
      queueMicrotask(() => callback("INITIAL_SESSION", readSession()));
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },

    // Magic link in production; here it signs in on the spot so the demo can reach the
    // authenticated screens (cart merge, checkout, order detail) without an inbox.
    async signInWithOtp({ email }: { email: string }) {
      signIn(email);
      return { error: null };
    },

    // No Google redirect to make in a static page — sign in as a fixed demo account.
    async signInWithOAuth() {
      signIn("demo@antropic.test");
      return { error: null };
    },

    async signOut() {
      writeSession(null);
      emit("SIGNED_OUT", null);
      return { error: null };
    },
  },

  storage: {
    from(_bucket: string) {
      return {
        getPublicUrl(_path: string) {
          return { data: { publicUrl: BLANK_PIXEL } };
        },
        async uploadToSignedUrl(_path: string, _token: string, _file: File) {
          return { data: null, error: null };
        },
      };
    },
  },
};
