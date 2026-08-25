import { Component, type ErrorInfo, type ReactNode } from "react";

// Last line of defence for the backoffice (auditoría §5).
//
// Same reason as the storefront's boundary, opposite audience. A customer gets an apology; the
// person working the verification queue gets the actual error text, because they are the one
// who will paste it into a message to whoever maintains the system. Hiding it here would only
// mean the report arrives as "el panel se puso en blanco".

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[admin] render error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-6">
        <div className="max-w-lg rounded-lg border border-slate-200 bg-white p-8">
          <h1 className="text-lg font-semibold text-slate-900">El panel dejó de responder</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ocurrió un error al dibujar esta pantalla. Nada de lo que estabas viendo se perdió en
            el servidor; recarga para volver a intentarlo.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Recargar el panel
          </button>
        </div>
      </div>
    );
  }
}
