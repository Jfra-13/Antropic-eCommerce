import {
  useListPickupPoints,
  getListPickupPointsQueryKey,
} from "@workspace/api-client-react";

// Public store locator: the same active pickup points offered at checkout.
export default function PickupPoints() {
  const { data, isLoading, isError } = useListPickupPoints({
    query: { queryKey: getListPickupPointsQueryKey() },
  });
  const points = data?.items ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
      <h1 className="font-display text-4xl text-foreground mb-2">Puntos de recojo</h1>
      <p className="font-sans text-sm text-muted-foreground mb-8">
        Compra online y recoge tu pedido sin costo de envío. Elige tu punto al finalizar la compra.
      </p>

      {isLoading && <p className="font-sans text-sm text-muted-foreground">Cargando ubicaciones…</p>}
      {isError && (
        <p className="font-sans text-sm text-muted-foreground">
          No pudimos cargar las ubicaciones. Intenta de nuevo en unos minutos.
        </p>
      )}

      <ul className="divide-y divide-border border border-border">
        {points.map((p) => (
          <li key={p.id} className="flex items-start gap-3 p-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5 text-primary"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <p className="font-sans font-semibold text-sm text-foreground">{p.name}</p>
              <p className="font-sans text-sm text-muted-foreground">{p.address}</p>
            </div>
          </li>
        ))}
        {!isLoading && !isError && points.length === 0 && (
          <li className="p-6 text-center font-sans text-sm text-muted-foreground">
            Por ahora no hay puntos de recojo disponibles.
          </li>
        )}
      </ul>
    </div>
  );
}
