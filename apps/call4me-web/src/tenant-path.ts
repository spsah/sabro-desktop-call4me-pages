/**
 * Stage A tenant path guard — pure, dependency-free.
 *
 * ASSUMPTION (CTO to ratify or rename): seat allow-set is read from
 * Identity `user.app_metadata.client_ids` (array of numbers and/or digit-strings).
 * This claim name is not yet ratified; Stage A uses it fail-closed.
 *
 * Registry: Stage-0 FreeSWITCH 6400-series client ids only (constant below).
 * Tenant map: injectable lookup; default returns unmapped for every id.
 * NEVER invent a mapping / hardcode a Sabro tenant UUID here.
 */

/** Ratified Stage-0 FreeSWITCH client ids (6400=sandbox, 6401=Encoretel/SABRO, 6402=MMPL, 6403=Ice). */
export const STAGE0_CLIENT_IDS = [6400, 6401, 6402, 6403] as const;

export const DEFAULT_TENANT_SURFACE = "pipeline" as const;

/** Four digits, no leading zero (stricter than bare \\d{4} — rejects 0640-style junk). */
const CLIENT_ID_RE = /^[1-9]\d{3}$/;
const KNOWN_SURFACES = new Set(["pipeline", "deals", "insights", "call4me"]);

export type TenantSurface =
  | "pipeline"
  | "deals"
  | "insights"
  | "call4me"
  | "root"
  | "not-found";

export type ParsedTenantPath = {
  clientId: string;
  surface: TenantSurface;
};

export type TenantMapping =
  | { state: "unmapped" }
  | { state: "mapped"; tenantId: string };

export type TenantGuardResult =
  | { ok: false; status: 401 | 403 | 404; reason: string }
  | {
      ok: true;
      clientId: string;
      surface: Exclude<TenantSurface, "not-found">;
      tenant: TenantMapping;
    };

export type TenantIdentityClaim = {
  app_metadata?: Record<string, unknown>;
} | null;

export type TenantLookup = (clientId: string) => string | null | undefined;

/** Open/empty by design — every id is unmapped until a future injectable map is wired. */
export const emptyTenantLookup: TenantLookup = () => null;

export function resolveDefaultTenantPath(clientId: string): string {
  return `/c/${clientId}/${DEFAULT_TENANT_SURFACE}`;
}

/**
 * Parse `/c/:clientId/...` without decoding. Rejects traversal, percent-encoding,
 * and any clientId that is not exactly four digits.
 */
export function parseTenantPath(pathname: string): ParsedTenantPath | null {
  if (typeof pathname !== "string" || pathname.length === 0) return null;
  if (pathname.includes("%") || pathname.includes("..")) return null;
  if (!pathname.startsWith("/c/")) return null;

  const parts = pathname.split("/").filter((p, i) => !(i === 0 && p === ""));
  // parts[0] === "c", parts[1] === clientId, parts[2] === surface?
  if (parts[0] !== "c" || parts.length < 2) return null;

  const clientId = parts[1] ?? "";
  if (!CLIENT_ID_RE.test(clientId)) return null;

  if (parts.length === 2) {
    return { clientId, surface: "root" };
  }

  if (parts.length === 3) {
    const segment = parts[2] ?? "";
    if (segment === "") return { clientId, surface: "root" };
    if (KNOWN_SURFACES.has(segment)) {
      return { clientId, surface: segment as Exclude<TenantSurface, "root" | "not-found"> };
    }
    return { clientId, surface: "not-found" };
  }

  return { clientId, surface: "not-found" };
}

function isKnownClient(clientId: string): boolean {
  const n = Number(clientId);
  return (STAGE0_CLIENT_IDS as readonly number[]).includes(n);
}

/**
 * Normalize `app_metadata.client_ids`. Fail closed on missing / empty / malformed.
 * Accepts numbers or digit-strings only; any other element => malformed.
 */
export function extractSeatClientIds(appMetadata: Record<string, unknown> | undefined): string[] | null {
  if (!appMetadata || !("client_ids" in appMetadata)) return null;
  const raw = appMetadata.client_ids;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "number" && Number.isInteger(entry) && entry >= 0) {
      out.push(String(entry));
      continue;
    }
    if (typeof entry === "string" && /^\d+$/.test(entry)) {
      out.push(entry);
      continue;
    }
    return null;
  }
  return out.length > 0 ? out : null;
}

export function evaluateTenantAccess(input: {
  pathname: string;
  identity: TenantIdentityClaim;
  lookupTenant?: TenantLookup;
}): TenantGuardResult {
  const parsed = parseTenantPath(input.pathname);
  if (!parsed) {
    return { ok: false, status: 404, reason: "invalid_tenant_path" };
  }

  if (!input.identity) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  if (!isKnownClient(parsed.clientId)) {
    return { ok: false, status: 403, reason: "unknown_client" };
  }

  const allowed = extractSeatClientIds(input.identity.app_metadata);
  if (!allowed) {
    return { ok: false, status: 403, reason: "seat_allow_set_denied" };
  }
  if (!allowed.includes(parsed.clientId)) {
    return { ok: false, status: 403, reason: "cross_path_denied" };
  }

  if (parsed.surface === "not-found") {
    return { ok: false, status: 404, reason: "unknown_surface" };
  }

  const lookup = input.lookupTenant ?? emptyTenantLookup;
  const tenantId = lookup(parsed.clientId);
  const tenant: TenantMapping =
    typeof tenantId === "string" && tenantId.trim().length > 0
      ? { state: "mapped", tenantId: tenantId.trim() }
      : { state: "unmapped" };

  return {
    ok: true,
    clientId: parsed.clientId,
    surface: parsed.surface,
    tenant,
  };
}
