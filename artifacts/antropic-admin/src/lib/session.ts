import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type StaffRole = "customer" | "employee" | "admin";

export type SessionState = {
  loading: boolean;
  session: Session | null;
  role: StaffRole | null;
  error: string | null;
};

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

// Fetch the caller's profile (id/email/role) from the API. The API bootstraps the profile
// from the verified JWT, so this is the source of truth for the role gate.
async function fetchRole(accessToken: string): Promise<StaffRole> {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`/api/me failed (${res.status})`);
  const body = (await res.json()) as { user?: { role?: StaffRole } };
  const role = body.user?.role;
  if (!role) throw new Error("No role in /api/me response");
  return role;
}

// Tracks the Supabase session and resolves the caller's role. Drives the auth + role gate
// in App. Staff sign in with Google/Magic Link; the role decides backoffice access.
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    session: null,
    role: null,
    error: null,
  });

  useEffect(() => {
    let active = true;

    async function resolve(session: Session | null) {
      if (!session) {
        if (active) setState({ loading: false, session: null, role: null, error: null });
        return;
      }
      try {
        const role = await fetchRole(session.access_token);
        if (active) setState({ loading: false, session, role, error: null });
      } catch (e) {
        if (active) {
          setState({
            loading: false,
            session,
            role: null,
            error: e instanceof Error ? e.message : "Failed to load profile",
          });
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, loading: true }));
      resolve(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
