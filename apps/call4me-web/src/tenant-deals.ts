/**
 * EMPTY-SAFE tenant deals fetch via same-origin host-bridge.
 * GET /sabro-auth/tenant-deals?client_id= with Identity bearer.
 * Never throws — returns [] on any failure.
 */

export type TenantDeal = {
  id: string;
  name: string;
  note?: string;
  telephone?: string;
  stage?: string;
};

export const TENANT_DEALS_PATH_PREFIX = "/sabro-auth/tenant-deals";

const RESOLVE_TIMEOUT_MS = 8000;

export type FetchTenantDealsInput = {
  clientId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

function buildUrl(clientId: string): string {
  return `${TENANT_DEALS_PATH_PREFIX}?client_id=${encodeURIComponent(clientId)}`;
}

function parseDeal(row: unknown): TenantDeal | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  const deal: TenantDeal = { id: record.id.trim(), name: record.name.trim() };
  if (typeof record.note === "string" && record.note.trim()) {
    deal.note = record.note.trim();
  }
  if (typeof record.telephone === "string" && record.telephone.trim()) {
    deal.telephone = record.telephone.trim();
  }
  if (typeof record.stage === "string" && record.stage.trim()) {
    deal.stage = record.stage.trim();
  }
  return deal;
}

function parseBody(body: unknown): TenantDeal[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const rows = Array.isArray(body)
    ? body
    : record.deals ?? record.items ?? record.data;
  if (!Array.isArray(rows)) return [];
  const out: TenantDeal[] = [];
  for (const row of rows) {
    const deal = parseDeal(row);
    if (deal) out.push(deal);
  }
  return out;
}

/**
 * Fetch active deals for a client. Fail closed to []. Never throws.
 */
export async function fetchTenantDeals(
  input: FetchTenantDealsInput,
): Promise<TenantDeal[]> {
  if (!input.accessToken || !input.clientId) return [];
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timeoutId);
      return [];
    }
    input.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const response = await fetchImpl(buildUrl(input.clientId), {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status !== 200) return [];
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return [];
    }
    return parseBody(body);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", onExternalAbort);
  }
}