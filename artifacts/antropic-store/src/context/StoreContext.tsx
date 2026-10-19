import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cart, CartItem, Wishlist } from '@workspace/api-client-react';
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
  useClaimGuestOrders,
  getListOrdersQueryKey,
  resolveGuestCart,
} from '@workspace/api-client-react';
import { supabase } from '../lib/supabase';
import { guestOrderPairs } from '../lib/guest-orders';

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
  // Guest cart variants the API says are no longer sold (deactivated product or variant). They
  // are not in `cart`, so an order built from `cart` would silently omit them; checkout uses
  // this to refuse to proceed until the customer removes them explicitly.
  unresolvedCartItems: { variantId: string; qty: number }[];
  // The guest cart could not be resolved (network, rate limit). Not the same as "no longer
  // sold": nothing is reported unresolved, and screens offer a retry instead of an empty cart.
  cartError: boolean;
  retryCart: () => void;
  addToCart: (variantId: string, qty?: number) => void;
  removeFromCart: (variantId: string) => void;
  updateQty: (variantId: string, qty: number) => void;
  // Empties the browser-side cart once a guest order has been placed from it. Logged in, the
  // server clears its own cart inside the order transaction, so there is nothing to do.
  clearGuestCart: () => void;
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

// Brand-neutral keys: localStorage is already scoped to the origin, so there is nothing for a
// brand prefix to disambiguate, and a rebrand should never be able to empty a shopper's cart.
// v2 = variant-keyed lines ({variantId, qty}); the older product-keyed shape could not be
// mapped to variants and was never migrated.
const GUEST_FAVORITES_KEY = 'store.favorites';
const GUEST_CART_KEY = 'store.cart.v2';

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
  const [guestCart, setGuestCart] = useState<GuestCartItem[]>(() => readGuestCart());

  useEffect(() => {
    if (user) return; // logged in: the server owns the cart
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestCart));
  }, [guestCart, user]);

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

  // Guest lines resolved by the API (POST /guest/checkout/cart), never against the catalogue
  // page the storefront happens to have cached: that list is capped and empty when its request
  // fails, and anything outside it used to read as "no longer sold" and block the checkout.
  // Keyed on the variant ids only — quantities come from the browser cart, so changing one does
  // not refetch. A stored line is never deleted behind the customer's back.
  const guestIds = [...new Set(guestCart.map((i) => i.variantId))].sort();
  const guestCartQuery = useQuery({
    queryKey: ['guestCart', guestIds],
    queryFn: () =>
      resolveGuestCart({ items: guestIds.map((variantId) => ({ variantId, quantity: 1 })) }),
    enabled: !user && guestIds.length > 0,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const guestLines = useMemo<CartLine[]>(() => {
    const byId = new Map<string, CartItem>(
      (guestCartQuery.data?.items ?? []).map((i) => [i.variantId, i]),
    );
    const lines: CartLine[] = [];
    for (const item of guestCart) {
      const i = byId.get(item.variantId);
      if (!i) continue;
      lines.push({
        variantId: i.variantId,
        productId: i.productId,
        slug: i.slug,
        name: i.name,
        size: i.size,
        color: i.color,
        unitPrice: i.unitPrice,
        qty: item.qty,
        stock: i.stock,
        image: i.image,
      });
    }
    return lines;
  }, [guestCart, guestCartQuery.data]);

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

  const unresolvedCartItems = useMemo(() => {
    if (user) return [];
    const missing = new Set(guestCartQuery.data?.missing ?? []);
    return guestCart.filter((i) => missing.has(i.variantId));
  }, [user, guestCart, guestCartQuery.data]);
  const guestCartPending = !user && guestIds.length > 0;
  const cartError = guestCartPending && guestCartQuery.isError;
  // Settled when the last answer (even the previous key's, kept as placeholder) accounts for
  // every id. A variant added since is in neither list until the refetch lands: the cart is
  // still loading, not short of a line. A removal never waits.
  const answered = new Set([
    ...(guestCartQuery.data?.items ?? []).map((i) => i.variantId),
    ...(guestCartQuery.data?.missing ?? []),
  ]);
  const guestCartSettled = guestIds.every((id) => answered.has(id));

  const cart = user ? serverLines : guestLines;
  // A guest cart is only ids until the API resolves them; reporting it as empty meanwhile would
  // bounce a guest who lands straight on /checkout back to an "empty" cart.
  const cartLoading = user ? cartQuery.isLoading : guestCartPending && !cartError && !guestCartSettled;
  const retryCart = () => {
    void guestCartQuery.refetch();
  };

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

  const clearGuestCart = () => {
    localStorage.removeItem(GUEST_CART_KEY);
    setGuestCart([]);
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

  // Guest orders placed from this browser become the account's orders once per login
  // (auditoría §1.4), so "mis pedidos" shows them. Each one is claimed with its access token —
  // the email proves nothing (a session can change it). Orders placed on another device are
  // claimed when their emailed link is opened while logged in (pages/GuestOrder.tsx). Best-effort
  // either way: the emailed link keeps opening the order regardless.
  const claimGuestOrders = useClaimGuestOrders();
  const claimedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      claimedForUser.current = null;
      return;
    }
    if (claimedForUser.current === user.id) return;
    claimedForUser.current = user.id;
    const orders = guestOrderPairs();
    if (orders.length === 0) return;

    claimGuestOrders
      .mutateAsync({ data: { orders } })
      .then(({ claimed }) => {
        if (claimed > 0) queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      })
      .catch(() => {});
    // claimGuestOrders/queryClient are stable; the claim is keyed on the user id only.
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
    <StoreContext.Provider value={{ favorites, toggleFavorite, cart, cartLoading, unresolvedCartItems, cartError, retryCart, addToCart, removeFromCart, updateQty, clearGuestCart, user, authLoading, signInWithGoogle, sendMagicLink, logout }}>
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
