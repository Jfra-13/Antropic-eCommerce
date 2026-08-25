import { Component, type ErrorInfo, type ReactNode } from "react";
import { brand } from "@workspace/brand";

// Last line of defence for the storefront (auditoría §5).
//
// Without this, a render error unmounts the whole React tree and the customer is left staring
// at a blank white page — no message, no way back, and nothing in any log that says it
// happened. A blank page is also the failure mode a customer never reports: they assume the
// store is broken and leave.
//
// A class component because that is the only thing React offers: `componentDidCatch` has no
// hook equivalent. This is not legacy code and should not be "modernised" into a hook.
//
// It does NOT report to an error-tracking service, because there is none yet — see
// artifacts/api-server/src/lib/observability.ts for the same decision on the server side.
// `logError` below is where a browser SDK would be initialised; until then the console is the
// only sink, which is honest about what is and is not being collected.

type Props = { children: ReactNode };
type State = { error: Error | null };

function logError(error: Error, info: ErrorInfo): void {
  // eslint-disable-next-line no-console
  console.error("[storefront] render error", error, info.componentStack);
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(error, info);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">Algo salió mal</h1>
          <p className="mt-3 text-muted-foreground">
            Tuvimos un problema al mostrar esta página. Tu carrito y tus pedidos están a salvo.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {/* A full reload, not a router navigation: the component tree that just crashed is
                not to be trusted to render its way out of the error. */}
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-5 py-2.5 text-primary-foreground hover:opacity-90"
            >
              Recargar la página
            </button>
            <a
              href={import.meta.env.BASE_URL}
              className="rounded-md border border-border px-5 py-2.5 text-foreground hover:bg-accent"
            >
              Volver al inicio
            </a>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Si vuelve a pasar, escríbenos y lo revisamos — {brand.name}.
          </p>
        </div>
      </div>
    );
  }
}
