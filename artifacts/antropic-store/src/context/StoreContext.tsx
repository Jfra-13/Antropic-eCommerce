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
import type { Cart, Wishlist } from '@workspace/api-client-react';
import {
  useGetWishlist,
  useAddWishlistItem,
  useRemoveWishlistItem,
  getGetWishlistQueryKey,
  useGetCart,
  useAddCartItem,
  useUpdateCartItem,
  useRemoveCartItem,
  useMergeCart,
  getGetCartQueryKey,
} from '@workspace/api-client-react';
import { supabase } from '../lib/supabase';
import { useProducts } from '../lib/catalog';
import { priceToNumber } from '../lib/product';

// One cart line, unified for guest and logged-in carts. `image` is a media path or URL —
// render it through mediaUrl(). `unitPrice` is a decimal string (e.g. "29.99").
export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  unitPrice: string;
  qty: number;
  stock: number;
  image: string | null;
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
  cart: CartLine[];
  cartLoading: boolean;
  addToCart: (variantId: string, qty?: number) => void;
  removeFromCart: (variantId: string) => void;
  updateQty: (variantId: string, qty: number) => void;
  user: AuthUser | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<AuthResult>;
  sendMagicLink: (email: string) => Promise<AuthResult>;
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
// v2: variant-keyed lines ({variantId, qty}). The legacy product-keyed 'antropic_cart'
// cannot be mapped to variants, so it is dropped on first load.
const GUEST_CART_KEY = 'antropic_cart_v2';
const LEGACY_GUEST_CART_KEY = 'antropic_cart';

type GuestCartItem = { variantId: string; qty: number };

function readGuestFavorites(): string[] {
  const saved = localStorage.getItem(GUEST_FAVORITES_KEY);
  return saved ? JSON.parse(saved) : [];
}

function readGuestCart(): GuestCartItem[] {
  const saved = localStorage.getItem(GUEST_CART_KEY);
  return saved ? JSON.parse(saved) : [];
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Cart ────────────────────────────────────────────────────────────────
  // Logged out: variant-keyed lines in localStorage, hydrated against the catalog for
  // display. Logged in: the server cart is the source of truth (variant-keyed, stock
  // clamped server-side); mutations return the fresh cart and it is written straight
  // into the query cache. Totals shown here are estimates — checkout quotes server-side.
  const [guestCart, setGuestCart] = useState<GuestCartItem[]>(() => {
    localStorage.removeItem(LEGACY_GUEST_CART_KEY);
    return readGuestCart();
  });

  useEffect(() => {
    if (user) return; // logged in: the server owns the cart
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestCart));
  }, [guestCart, user]);

  const { products } = useProducts();

  const cartQuery = useGetCart({
    query: { enabled: !!user, queryKey: getGetCartQueryKey() },
  });
  const addCartItem = useAddCartItem();
  const updateCartItem = useUpdateCartItem();
  const removeCartItem = useRemoveCartItem();
  const mergeCart = useMergeCart();

  const writeCart = (c: Cart) => {
    queryClient.setQueryData(getGetCartQueryKey(), c);
  };

  // Guest lines hydrated from the cached catalog. A variant not in the catalog anymore
  // (deactivated product) is silently dropped from display; merge skips it server-side too.
  const guestLines = useMemo<CartLine[]>(() => {
    const lines: CartLine[] = [];
    for (const item of guestCart) {
      for (const p of products) {
        const option = p.variantOptions.find((v) => v.id === item.variantId);
        if (!option) continue;
        lines.push({
          variantId: option.id,
          productId: p.id,
          slug: p.slug,
          name: p.name,
          size: option.size,
          color: option.color,
          unitPrice: priceToNumber(p.price).toFixed(2),
          qty: item.qty,
          stock: option.stock,
          image: p.images[0] ?? null,
        });
        break;
      }
    }
    return lines;
  }, [guestCart, products]);

  const serverLines = useMemo<CartLine[]>(
    () =>
      (cartQuery.data?.items ?? []).map((i) => ({
        variantId: i.variantId,
        productId: i.productId,
        slug: i.slug,
        name: i.name,
        size: i.size,
        color: i.color,
        unitPrice: i.unitPrice,
        qty: i.quantity,
        stock: i.stock,
        image: i.image,
      })),
    [cartQuery.data],
  );

  const cart = user ? serverLines : guestLines;
  const cartLoading = user ? cartQuery.isLoading : false;

  const addToCart = (variantId: string, qty = 1) => {
    if (!user) {
      setGuestCart((prev) => {
        const existing = prev.find((i) => i.variantId === variantId);
        if (existing) {
          return prev.map((i) =>
            i.variantId === variantId ? { ...i, qty: i.qty + qty } : i,
          );
        }
        return [...prev, { variantId, qty }];
      });
      return;
    }
    addCartItem.mutate(
      { data: { variantId, quantity: qty } },
      { onSuccess: writeCart },
    );
  };

  const removeFromCart = (variantId: string) => {
    if (!user) {
      setGuestCart((prev) => prev.filter((i) => i.variantId !== variantId));
      return;
    }
    removeCartItem.mutate({ variantId }, { onSuccess: writeCart });
  };

  const updateQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(variantId);
      return;
    }
    if (!user) {
      setGuestCart((prev) =>
        prev.map((i) => (i.variantId === variantId ? { ...i, qty } : i)),
      );
      return;
    }
    updateCartItem.mutate({ variantId, data: { quantity: qty } }, { onSuccess: writeCart });
  };

  // Merge the guest cart into the server cart once per login (sums quantities, clamps to
  // stock server-side). Mirrors the wishlist merge below.
  const cartMergedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      cartMergedForUser.current = null;
      return;
    }
    if (cartMergedForUser.current === user.id) return;
    cartMergedForUser.current = user.id;

    const guest = readGuestCart();
    if (guest.length === 0) return;

    mergeCart
      .mutateAsync({ data: { items: guest.map((i) => ({ variantId: i.variantId, quantity: i.qty })) } })
      .then(writeCart)
      .catch(() => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }))
      .finally(() => {
        localStorage.removeItem(GUEST_CART_KEY);
        setGuestCart([]);
      });
    // mergeCart/queryClient are stable; merge is keyed on the user id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  // Passwordless auth (decided: Google OAuth + Magic Link, minimal clicks).
  // onAuthStateChange drives setUser once the session lands; these actions only kick
  // off the flow and surface any error string to the UI.
  //
  // Google: full-page redirect to Google, then back to `redirectTo`. On success the
  // browser navigates away, so the promise only matters for the error path.
  const signInWithGoogle = async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return error ? { error: error.message } : {};
  };

  // Magic Link: emails a one-time access link. First login auto-creates the account,
  // so there is no separate register flow.
  const sendMagicLink = async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return error ? { error: error.message } : {};
  };

  const logout = async () => {
    await supabase.auth.signOut();
    // Server-owned caches are meaningless without a session.
    queryClient.removeQueries({ queryKey: getGetCartQueryKey() });
    queryClient.removeQueries({ queryKey: getGetWishlistQueryKey() });
  };

  return (
    <StoreContext.Provider value={{ favorites, toggleFavorite, cart, cartLoading, addToCart, removeFromCart, updateQty, user, authLoading, signInWithGoogle, sendMagicLink, logout }}>
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
