export const WINDSOR_MCP_UPSTREAM_ORIGIN = "https://mcp.windsor.ai";
export const WINDSOR_MCP_PROXY_PREFIX = "/windsor-mcp";
export const WINDSOR_MCP_SAME_ORIGIN_PROXY = "/windsor-mcp/";

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
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "cf-ipcountry",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
]);

export function isWindsorMcpProxyPath(pathname: string): boolean {
  return (
    pathname === WINDSOR_MCP_PROXY_PREFIX ||
    pathname.startsWith(`${WINDSOR_MCP_PROXY_PREFIX}/`)
  );
}

export function rewriteWindsorMcpProxyPath(pathname: string): string {
  if (!isWindsorMcpProxyPath(pathname)) {
    throw new Error("not a Windsor MCP proxy path");
  }
  const rest = pathname.slice(WINDSOR_MCP_PROXY_PREFIX.length);
  return rest.length > 0 ? rest : "/";
}

export function windsorMcpUpstreamUrl(requestUrl: string): URL {
  const incoming = new URL(requestUrl);
  const upstream = new URL(WINDSOR_MCP_UPSTREAM_ORIGIN);
  upstream.pathname = rewriteWindsorMcpProxyPath(incoming.pathname);
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
  headers.set("Host", "mcp.windsor.ai");
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
  headers.set(
    "Access-Control-Expose-Headers",
    "Mcp-Session-Id, mcp-session-id",
  );
  return headers;
}

export async function handleWindsorMcpProxyRequest(
  request: Request,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const upstreamUrl = windsorMcpUpstreamUrl(request.url);
  const headers = copyForwardHeaders(request.headers);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  const upstream = await fetchImpl(upstreamUrl, init);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyDownstreamHeaders(upstream.headers),
  });
}

export function isPathCFallbackFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "NetworkError")
    return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|cors|failed with status 404|failed with status 405/i.test(
    message,
  );
}
