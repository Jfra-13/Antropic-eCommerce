import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useSeo } from "../lib/seo";

export default function NotFound() {
  // A 404 must never be indexed: it has no content to rank and, on a SPA, every unknown URL
  // reaches it — a mistyped link would otherwise put an empty page in the search results.
  useSeo({ title: "Página no encontrada", noindex: true });

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-primary" />
            <h1 className="font-display text-2xl text-foreground">
              No encontramos esta página
            </h1>
          </div>

          <p className="mt-4 font-sans text-sm text-muted-foreground">
            Puede que el enlace haya cambiado o que la prenda ya no esté disponible.
          </p>

          <div className="mt-6 flex gap-3">
            <Link
              href="/"
              className="font-sans text-sm px-4 py-2 rounded-full bg-primary text-primary-foreground"
            >
              Ir al inicio
            </Link>
            <Link
              href="/search"
              className="font-sans text-sm px-4 py-2 rounded-full border border-border text-foreground"
            >
              Ver el catálogo
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
