import { Suspense, lazy, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { StoreProvider } from "./context/StoreContext";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
// Home is imported eagerly: it is what most visitors land on, and lazy-loading it would add
// a second network round trip before the first paint of the page that matters most.
//
// Every other route is split. Before this, a visitor who only looked at the home page still
// downloaded checkout, the account area, the complaints form and the legal pages — 733 kB of
// JavaScript to render a product grid. Splitting per route is the SPA equivalent of not
// shipping the whole shop to someone standing at the door. Measurements in docs/SEO.md §5.
import Home from "./pages/Home";

const Search = lazy(() => import("./pages/Search"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const Faq = lazy(() => import("./pages/Faq"));
const Returns = lazy(() => import("./pages/Returns"));
const PickupPoints = lazy(() => import("./pages/PickupPoints"));
const LibroReclamaciones = lazy(() => import("./pages/LibroReclamaciones"));
const Privacidad = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacidad })));
const Terminos = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Terminos })));
const Cookies = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Cookies })));
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
        {/* The fallback reserves the viewport height it replaces. A zero-height fallback
            would collapse the layout for the length of one chunk download and score as
            cumulative layout shift on the very navigation it was meant to speed up. */}
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex items-center justify-center">
              <span className="font-sans text-sm text-muted-foreground">Cargando…</span>
            </div>
          }
        >
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
        </Suspense>
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
