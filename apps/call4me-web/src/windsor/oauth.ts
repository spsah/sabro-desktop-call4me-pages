import {
  clearPendingWindsorOAuth,
  getWindsorPersistedTokens,
  loadPendingWindsorOAuth,
  persistWindsorTokens,
  savePendingWindsorOAuth,
  type WindsorPersistedTokens,
} from "./auth";
import { connectWindsorStatus, type WindsorAdsReport } from "./mcp";
import { requireTrustedPrincipal, WINDSOR_MCP_URL } from "./policy";

export const WINDSOR_OAUTH_ISSUER = "https://mcp.windsor.ai/";
export const WINDSOR_OAUTH_METADATA_URL =
  "https://mcp.windsor.ai/.well-known/oauth-authorization-server";
/** Windsor FastMCP gates tools/call on `create` and `delete` (no read scope exists). SABRO write-actions ON; scopes unchanged. */
export const WINDSOR_OAUTH_SCOPES = "offline_access create delete";
export const WINDSOR_RESOURCE = "https://mcp.windsor.ai/";
export const WINDSOR_WEB_CALLBACK_FILE = "windsor-callback.html";

export type WindsorOAuthMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  code_challenge_methods_supported?: string[];
};

export type WindsorPkcePair = {
  codeVerifier: string;
  codeChallenge: string;
  method: "S256";
};

export type WindsorCallback = {
  code: string;
  state: string;
};

export type WindsorOAuthDeps = {
  fetchImpl?: typeof fetch;
  openExternal: (url: string) => Promise<void> | void;
  now?: () => number;
  redirectUri?: string;
};

const FALLBACK_METADATA: WindsorOAuthMetadata = {
  issuer: WINDSOR_OAUTH_ISSUER,
  authorization_endpoint: "https://mcp.windsor.ai/authorize",
  token_endpoint: "https://mcp.windsor.ai/token",
  registration_endpoint: "https://mcp.windsor.ai/register",
  code_challenge_methods_supported: ["S256"],
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function getWindsorWebRedirectUri(
  locationHref: string = typeof window === "undefined"
    ? "http://localhost/windsor.html"
    : window.location.href,
): string {
  return new URL(WINDSOR_WEB_CALLBACK_FILE, locationHref).toString();
}

export async function createWindsorPkcePair(
  randomBytes: (size: number) => Uint8Array = defaultRandomBytes,
  sha256: (value: string) => Promise<Uint8Array> = defaultSha256,
): Promise<WindsorPkcePair> {
  const codeVerifier = bytesToBase64Url(randomBytes(32));
  const codeChallenge = bytesToBase64Url(await sha256(codeVerifier));
  return { codeVerifier, codeChallenge, method: "S256" };
}

export function createOAuthState(
  randomBytes: (size: number) => Uint8Array = defaultRandomBytes,
): string {
  return bytesToBase64Url(randomBytes(24));
}

function defaultRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function defaultSha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

export function isWindsorWebCallbackRoute(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return (
    path.endsWith(`/${WINDSOR_WEB_CALLBACK_FILE}`) ||
    path.endsWith("/windsor/callback")
  );
}

export function extractWindsorCallback(rawUrl: string): WindsorCallback | null {
  if (!isWindsorWebCallbackRoute(rawUrl)) return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(`Windsor OAuth error: ${error}`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return null;
  return { code, state };
}

export function buildWindsorAuthorizeUrl(input: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource?: string;
  scope?: string;
}): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", input.scope ?? WINDSOR_OAUTH_SCOPES);
  url.searchParams.set("resource", input.resource ?? WINDSOR_RESOURCE);
  return url.toString();
}

export async function discoverWindsorOAuthMetadata(
  fetchImpl: typeof fetch = fetch,
): Promise<WindsorOAuthMetadata> {
  try {
    const response = await fetchImpl(WINDSOR_OAUTH_METADATA_URL, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return FALLBACK_METADATA;
    const body = (await response.json()) as Partial<WindsorOAuthMetadata>;
    if (
      typeof body.authorization_endpoint !== "string" ||
      typeof body.token_endpoint !== "string" ||
      typeof body.registration_endpoint !== "string"
    ) {
      return FALLBACK_METADATA;
    }
    return {
      issuer:
        typeof body.issuer === "string" ? body.issuer : WINDSOR_OAUTH_ISSUER,
      authorization_endpoint: body.authorization_endpoint,
      token_endpoint: body.token_endpoint,
      registration_endpoint: body.registration_endpoint,
      code_challenge_methods_supported: body.code_challenge_methods_supported,
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export async function registerWindsorPublicClient(input: {
  registrationEndpoint: string;
  redirectUris: string[];
  fetchImpl?: typeof fetch;
}): Promise<{ clientId: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "SABRO Web",
      redirect_uris: input.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Windsor OAuth client registration failed (${response.status})`,
    );
  }
  const body = (await response.json()) as { client_id?: string };
  if (!body.client_id?.trim()) {
    throw new Error("Windsor OAuth client registration returned no client_id");
  }
  return { clientId: body.client_id.trim() };
}

export async function exchangeWindsorAuthorizationCode(input: {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<WindsorPersistedTokens> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
    resource: WINDSOR_RESOURCE,
  });
  const response = await fetchImpl(input.tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Windsor OAuth token exchange failed (${response.status})`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  if (
    typeof payload.api_key === "string" ||
    typeof payload.apiKey === "string"
  ) {
    throw new Error("Windsor API keys are forbidden; OAuth only");
  }
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("Windsor OAuth token response missing access_token");
  }
  const now = input.now ?? Date.now;
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : undefined;
  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : undefined,
    expiresAt: expiresIn ? now() + expiresIn * 1000 : undefined,
    clientId: input.clientId,
  };
}

function connectReport(
  holdReason: string,
  status: WindsorAdsReport["status"] = "connect_windsor",
): WindsorAdsReport {
  return {
    ...connectWindsorStatus(),
    status,
    holdReason,
    liveGetData: "HOLD",
  };
}

export function windsorWebConsentHoldReason(_redirectUri?: string): string {
  return [
    "Connect Windsor opens this browser so you can approve access.",
    "Your connection stays in this tab only — never in chat or an API key field.",
    "Campaign changes are allowed on your connected Meta accounts.",
  ].join(" ");
}

export async function beginWindsorBrowserConsent(
  input: {
    principal: string;
  } & WindsorOAuthDeps,
): Promise<WindsorAdsReport> {
  requireTrustedPrincipal(input.principal);
  const fetchImpl = input.fetchImpl ?? fetch;
  const redirectUri = input.redirectUri ?? getWindsorWebRedirectUri();
  const metadata = await discoverWindsorOAuthMetadata(fetchImpl);
  const { clientId } = await registerWindsorPublicClient({
    registrationEndpoint: metadata.registration_endpoint,
    redirectUris: [redirectUri],
    fetchImpl,
  });
  const pkce = await createWindsorPkcePair();
  const state = createOAuthState();
  savePendingWindsorOAuth({
    clientId,
    redirectUri,
    codeVerifier: pkce.codeVerifier,
    state,
  });
  const authorizeUrl = buildWindsorAuthorizeUrl({
    authorizationEndpoint: metadata.authorization_endpoint,
    clientId,
    redirectUri,
    state,
    codeChallenge: pkce.codeChallenge,
  });
  await input.openExternal(authorizeUrl);
  return connectReport(windsorWebConsentHoldReason(redirectUri));
}

export async function completeWindsorOAuthCallback(
  rawUrl: string,
  deps: Omit<WindsorOAuthDeps, "openExternal"> = {},
): Promise<boolean> {
  const session = loadPendingWindsorOAuth();
  if (!session) return false;
  const callback = extractWindsorCallback(rawUrl);
  if (!callback) return false;
  if (callback.state !== session.state) {
    throw new Error("Windsor OAuth state mismatch");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const metadata = await discoverWindsorOAuthMetadata(fetchImpl);
  const tokens = await exchangeWindsorAuthorizationCode({
    tokenEndpoint: metadata.token_endpoint,
    clientId: session.clientId,
    code: callback.code,
    redirectUri: session.redirectUri,
    codeVerifier: session.codeVerifier,
    fetchImpl,
    now: deps.now,
  });
  persistWindsorTokens(tokens);
  clearPendingWindsorOAuth();
  return true;
}

export async function refreshWindsorOAuthTokens(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<boolean> {
  const persisted = getWindsorPersistedTokens();
  if (!persisted?.refreshToken?.trim() || !persisted.clientId?.trim()) {
    return false;
  }
  const metadata = await discoverWindsorOAuthMetadata(fetchImpl);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: persisted.refreshToken,
    client_id: persisted.clientId,
    resource: WINDSOR_RESOURCE,
  });
  const response = await fetchImpl(metadata.token_endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) return false;
  const payload = (await response.json()) as Record<string, unknown>;
  if (
    typeof payload.api_key === "string" ||
    typeof payload.apiKey === "string"
  ) {
    throw new Error("Windsor API keys are forbidden; OAuth only");
  }
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) return false;
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : undefined;
  persistWindsorTokens({
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string" && payload.refresh_token.trim()
        ? payload.refresh_token
        : persisted.refreshToken,
    expiresAt: expiresIn ? now() + expiresIn * 1000 : persisted.expiresAt,
    clientId: persisted.clientId,
  });
  return true;
}

export function windsorAppHref(locationHref: string): string {
  return new URL("windsor.html", locationHref).toString();
}

void WINDSOR_MCP_URL;
