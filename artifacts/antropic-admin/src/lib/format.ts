import { ApiError } from "@workspace/api-client-react";

// Money is a fixed-point string from the API (e.g. "129.00"). Display only — never math here.
export function soles(amount: string): string {
  return `S/ ${amount}`;
}

// Pull the API's business error message ({ code, message }) out of an ApiError.
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const data = e.data as { message?: string } | null;
    return data?.message ?? e.message;
  }
  return e instanceof Error ? e.message : "Error inesperado";
}

// Business error code ({ code }) from an ApiError, for branching on specific failures.
export function errorCode(e: unknown): string | undefined {
  if (e instanceof ApiError) {
    return (e.data as { code?: string } | null)?.code ?? undefined;
  }
  return undefined;
}
