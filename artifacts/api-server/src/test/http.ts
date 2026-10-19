import express from "express";
import type { AddressInfo } from "node:net";
import router from "../routes";

// The real route tree over HTTP, for tests whose claim is about who reaches what: role gates
// and ownership checks live in middleware and routers, which a service-level test never
// crosses. The app.ts shell (rate limits, CORS, logging) is left out on purpose — a suite that
// fires dozens of requests would trip the limiters and fail for the wrong reason.
//
// Callers mock `jose` so that the bearer token IS the profile id (see the test files). Only
// the signature check is faked: requireAuth still loads the profile and its role from the
// database, exactly as in production.
export async function startApi() {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  return {
    request(method: string, path: string, asProfileId?: string, body?: unknown) {
      return fetch(base + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(asProfileId ? { authorization: `Bearer ${asProfileId}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type Api = Awaited<ReturnType<typeof startApi>>;
