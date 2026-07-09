import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
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

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('antropic_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('antropic_cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('antropic_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('antropic_cart', JSON.stringify(cart));
  }, [cart]);

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

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

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
