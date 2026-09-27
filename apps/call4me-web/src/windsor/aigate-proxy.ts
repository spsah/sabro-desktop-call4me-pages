export const BRIDGE_UPSTREAM_ORIGIN = "https://bridge.makh.ai";
export const AIGATE_PROXY_PREFIX = "/aigate";
export const AIGATE_SAME_ORIGIN_PROXY = "/aigate/";
export const AIGATE_MESSAGES_PATH = "/aigate/v1/messages";

export const AIGATE_UNAVAILABLE_HOLD =
  "AIGATE HOLD: same-origin /aigate is not configured. CoS: mount /aigate → https://bridge.makh.ai and set AIGATE_AUTH_TOKEN on the host (never in git). Meta ads still work via Windsor MCP after Connect. Ice tenants are not MMPL.";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cookie",
  "cookie2",
  "authorization",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "cf-ipcountry",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
]);

export function isAigateProxyPath(pathname: string): boolean {
  return (
    pathname === AIGATE_PROXY_PREFIX ||
    pathname.startsWith(`${AIGATE_PROXY_PREFIX}/`)
  );
}

export function rewriteAigateProxyPath(pathname: string): string {
  if (!isAigateProxyPath(pathname)) {
    throw new Error("not an aigate proxy path");
  }
  const rest = pathname.slice(AIGATE_PROXY_PREFIX.length);
  return rest.length > 0 ? rest : "/";
}

export function aigateUpstreamUrl(requestUrl: string): URL {
  const incoming = new URL(requestUrl);
  const upstream = new URL(BRIDGE_UPSTREAM_ORIGIN);
  upstream.pathname = rewriteAigateProxyPath(incoming.pathname);
  upstream.search = incoming.search;
  return upstream;
}

function copyForwardHeaders(from: Headers): Headers {
  const headers = new Headers();
  from.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set("Host", "bridge.makh.ai");
  return headers;
}

function copyDownstreamHeaders(from: Headers): Headers {
  const headers = new Headers();
  from.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === "set-cookie") return;
    headers.set(key, value);
  });
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function aigateUnavailableResponse(): Response {
  return new Response(JSON.stringify({ error: AIGATE_UNAVAILABLE_HOLD }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleAigateProxyRequest(
  request: Request,
  input: {
    authToken?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const token = input.authToken?.trim();
  if (!token) return aigateUnavailableResponse();

  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = copyForwardHeaders(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("x-api-key", token);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  const upstream = await fetchImpl(aigateUpstreamUrl(request.url), init);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyDownstreamHeaders(upstream.headers),
  });
}

export function isAigateUnavailableFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "NetworkError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /AIGATE HOLD|failed to fetch|networkerror|cors|status 404|status 405|status 502|status 503/i.test(
    message,
  );
}
