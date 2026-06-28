import React, { createContext, useContext, useState, useEffect } from 'react';
import { MOCK_USER } from '../data/mockData';

interface CartItem {
  productId: string;
  qty: number;
}

interface StoreContextType {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  cart: CartItem[];
  addToCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  user: typeof MOCK_USER | null;
  login: () => void;
  logout: () => void;
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

  const [user, setUser] = useState<typeof MOCK_USER | null>(() => {
    const saved = localStorage.getItem('antropic_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem('antropic_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('antropic_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('antropic_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('antropic_user');
    }
  }, [user]);

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

  const login = () => setUser(MOCK_USER);
  const logout = () => setUser(null);

  return (
    <StoreContext.Provider value={{ favorites, toggleFavorite, cart, addToCart, removeFromCart, updateQty, user, login, logout }}>
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
