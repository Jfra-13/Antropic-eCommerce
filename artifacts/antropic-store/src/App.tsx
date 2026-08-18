import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { StoreProvider } from "./context/StoreContext";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import Home from "./pages/Home";
import Search from "./pages/Search";
import ProductDetail from "./pages/ProductDetail";
import Favorites from "./pages/Favorites";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderDetail from "./pages/OrderDetail";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Faq from "./pages/Faq";
import Returns from "./pages/Returns";
import PickupPoints from "./pages/PickupPoints";
import LibroReclamaciones from "./pages/LibroReclamaciones";
import { Privacidad, Terminos, Cookies } from "./pages/Legal";
import { CookieBanner } from "./components/CookieBanner";

const queryClient = new QueryClient();

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/search" component={Search} />
          <Route path="/product/:slug" component={ProductDetail} />
          <Route path="/favorites" component={Favorites} />
          <Route path="/cart" component={Cart} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/orders/:id" component={OrderDetail} />
          <Route path="/login" component={Login} />
          <Route path="/profile" component={Profile} />
          <Route path="/faq" component={Faq} />
          <Route path="/devoluciones" component={Returns} />
          <Route path="/recojo" component={PickupPoints} />
          {/* Legal. The Libro de Reclamaciones route must stay publicly reachable and linked
              from every page — see the footer. */}
          <Route path="/libro-de-reclamaciones" component={LibroReclamaciones} />
          <Route path="/privacidad" component={Privacidad} />
          <Route path="/terminos" component={Terminos} />
          <Route path="/cookies" component={Cookies} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTop />
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

export default App;
