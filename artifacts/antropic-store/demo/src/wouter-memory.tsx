// `wouter` with an in-memory location, substituted for the real package inside
// `artifacts/antropic-store/src/App.tsx` only (see the resolver plugin in vite.config.ts).
//
// The demo is published as a single static page whose URL is not under our control, and
// which may be rendered in a sandboxed frame where History API writes throw. Routing in
// memory keeps every in-app link working without ever touching the address bar. Only
// App.tsx is patched, because it is the one place that mounts `<Router>`; every other
// `useLocation`/`<Link>` in the app reads the hook off the router context and follows
// along on its own.

import type { ComponentProps } from "react";
import { Router as BaseRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";

export * from "wouter";

const { hook } = memoryLocation({ path: "/", record: true });

export function Router(props: ComponentProps<typeof BaseRouter>) {
  return <BaseRouter hook={hook} {...props} />;
}
