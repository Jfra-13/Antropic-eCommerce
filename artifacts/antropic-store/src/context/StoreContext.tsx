import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import type { Wishlist } from '@workspace/api-client-react';
import {
  useGetWishlist,
  useAddWishlistItem,
  useRemoveWishlistItem,
  getGetWishlistQueryKey,
} from '@workspace/api-client-react';
import { supabase } from '../lib/supabase';

interface CartItem {
  productId: string;
  qty: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// Result shape for auth actions: the UI shows `error` when present, redirects otherwise.
type AuthResult = { error?: string };

interface StoreContextType {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  cart: CartItem[];
  addToCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  user: AuthUser | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

function toAuthUser(u: User): AuthUser {
  const metaName = typeof u.user_metadata?.name === 'string' ? u.user_metadata.name : '';
  return {
    id: u.id,
    email: u.email ?? '',
    name: metaName || u.email?.split('@')[0] || 'Usuaria',
  };
}

const GUEST_FAVORITES_KEY = 'antropic_favorites';

function readGuestFavorites(): string[] {
  const saved = localStorage.getItem(GUEST_FAVORITES_KEY);
  return saved ? JSON.parse(saved) : [];
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Cart ────────────────────────────────────────────────────────────────
  // Still localStorage + product-keyed. The variant-aware cart wired to the API
  // arrives with checkout (Fase 4); the API cart is keyed by variantId, which the
  // front doesn't resolve yet. Left untouched on purpose.
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('antropic_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('antropic_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (id: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === id);
      if (existing) {
        return prev.map(item => item.productId === id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { productId: id, qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.productId !== id));
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    setCart(prev => prev.map(item => item.productId === id ? { ...item, qty } : item));
  };

  // ── Favorites / wishlist ──────────────────────────────────────────────────
  // Logged out: guest favorites (product ids) persist in localStorage. Logged in:
  // the server wishlist is the source of truth — toggles hit the API and the guest
  // list is merged in on login.
  const [guestFavorites, setGuestFavorites] = useState<string[]>(readGuestFavorites);

  const wishlistQuery = useGetWishlist({
    query: { enabled: !!user, queryKey: getGetWishlistQueryKey() },
  });
  const addWishlist = useAddWishlistItem();
  const removeWishlist = useRemoveWishlistItem();

  const serverFavorites = useMemo(
    () => (wishlistQuery.data?.items ?? []).map(p => p.id),
    [wishlistQuery.data],
  );

  const favorites = user ? serverFavorites : guestFavorites;

  // Persist guest favorites only while logged out — once logged in the server owns them.
  useEffect(() => {
    if (user) return;
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(guestFavorites));
  }, [guestFavorites, user]);

  // Mutations return the fresh wishlist; write it straight into the query cache so the
  // UI updates without an extra round-trip.
  const writeWishlist = (w: Wishlist) => {
    queryClient.setQueryData(getGetWishlistQueryKey(), w);
  };

  const toggleFavorite = (id: string) => {
    if (!user) {
      setGuestFavorites(prev =>
        prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id],
      );
      return;
    }
    if (serverFavorites.includes(id)) {
      removeWishlist.mutate({ productId: id }, { onSuccess: writeWishlist });
    } else {
      addWishlist.mutate({ data: { productId: id } }, { onSuccess: writeWishlist });
    }
  };

  // Supabase persists the session in localStorage and keeps it fresh. We read the
  // initial session, then subscribe to changes (login/logout/token refresh across tabs).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session ? toAuthUser(data.session.user) : null);
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? toAuthUser(session.user) : null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Merge guest favorites into the server wishlist once per login. Best-effort: add is
  // idempotent server-side, so re-runs are harmless; a failed add just skips that item.
  const mergedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      mergedForUser.current = null;
      return;
    }
    if (mergedForUser.current === user.id) return;
    mergedForUser.current = user.id;

    const guest = readGuestFavorites();
    if (guest.length === 0) return;

    Promise.allSettled(
      guest.map(productId => addWishlist.mutateAsync({ data: { productId } })),
    ).finally(() => {
      localStorage.removeItem(GUEST_FAVORITES_KEY);
      setGuestFavorites([]);
      queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey() });
    });
    // addWishlist/queryClient are stable; merge is keyed on the user id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // onAuthStateChange drives setUser — these actions only kick off the request and
  // surface any error string to the UI.
  const login = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const register = async (
    name: string,
    email: string,
    password: string,
  ): Promise<AuthResult> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return error ? { error: error.message } : {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <StoreContext.Provider value={{ favorites, toggleFavorite, cart, addToCart, removeFromCart, updateQty, user, authLoading, login, register, logout }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
