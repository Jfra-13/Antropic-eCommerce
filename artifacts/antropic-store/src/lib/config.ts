import { useGetPublicConfig, getGetPublicConfigQueryKey } from "@workspace/api-client-react";

// Public store config set by the business in the admin panel: delivery fee, free-shipping
// threshold, Yape number/QR, banners. Changes rarely — cache it for the session.
export function useStoreConfig() {
  const query = useGetPublicConfig({
    query: { queryKey: getGetPublicConfigQueryKey(), staleTime: 5 * 60_000 },
  });
  return { ...query, config: query.data };
}
