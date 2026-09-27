/**
 * Stage C: resolve clientId → tenant via same-origin host-bridge.
 *
 * The SPA Identity JWT (project A) cannot query the tenant map in project B.
 * Call GET /sabro-auth/tenant-map with the Identity access token. Fail closed.
 * NEVER hardcode a Sabro tenant UUID. NEVER call Supabase for this map.
 */

import type { TenantMapping } from "./tenant-path";

export const TENANT_MAP_PATH_PREFIX = "/sabro-auth/tenant-map";

const TENANT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESOLVE_TIMEOUT_MS = 8000;

export type ResolveTenantViaBridgeInput = {
  clientId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

type CacheEntry = Promise<TenantMapping>;

const cache = new Map<string, CacheEntry>();

function cacheKey(clientId: string, accessToken: string): string {
  return `${clientId}\0${accessToken}`;
}

/** Test helper — clears the in-memory session cache. */
export function clearTenantMapCache(): void {
  cache.clear();
}

function buildTenantMapUrl(clientId: string): string {
  return `${TENANT_MAP_PATH_PREFIX}?client_id=${encodeURIComponent(clientId)}`;
}

function parseMappedBody(clientId: string, body: unknown): TenantMapping {
  if (!body || typeof body !== "object") return { state: "unmapped" };
  const record = body as Record<string, unknown>;
  if (typeof record.client_id !== "number" || !Number.isInteger(record.client_id)) {
    return { state: "unmapped" };
  }
  if (String(record.client_id) !== clientId) return { state: "unmapped" };
  if (typeof record.tenant_id !== "string") return { state: "unmapped" };
  const tenantId = record.tenant_id.trim();
  if (!TENANT_UUID_RE.test(tenantId)) return { state: "unmapped" };
  return { state: "mapped", tenantId };
}

async function fetchOnce(input: ResolveTenantViaBridgeInput): Promise<TenantMapping> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const url = buildTenantMapUrl(input.clientId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timeoutId);
      return { state: "unmapped" };
    }
    input.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status !== 200) return { state: "unmapped" };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { state: "unmapped" };
    }
    return parseMappedBody(input.clientId, body);
  } catch {
    return { state: "unmapped" };
  } finally {
    clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Resolve clientId → tenant via same-origin bridge. Fail closed to unmapped.
 * One attempt per (clientId, accessToken) for the session; result cached in memory.
 * Never throws.
 */
export function resolveTenantViaBridge(
  input: ResolveTenantViaBridgeInput,
): Promise<TenantMapping> {
  if (!input.accessToken || !input.clientId) {
    return Promise.resolve({ state: "unmapped" });
  }
  const key = cacheKey(input.clientId, input.accessToken);
  const existing = cache.get(key);
  if (existing) return existing;

  const pending = fetchOnce(input);
  cache.set(key, pending);
  return pending;
}
