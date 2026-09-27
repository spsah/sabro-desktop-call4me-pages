import { describe, expect, it, vi } from "vitest";
import appCaddySnippet from "../../path-a/Caddyfile.app.sabro.cloud.snippet?raw";
import caddySnippet from "../../path-a/Caddyfile.windsor-mcp.snippet?raw";
import workerSource from "../../path-a/worker.ts?raw";
import wranglerToml from "../../path-a/wrangler.toml?raw";
import { windsorMcpRequestUrl } from "./mcp";
import { WINDSOR_MCP_URL } from "./policy";
import {
  handleWindsorMcpProxyRequest,
  isPathCFallbackFailure,
  isWindsorMcpProxyPath,
  rewriteWindsorMcpProxyPath,
  WINDSOR_MCP_SAME_ORIGIN_PROXY,
  WINDSOR_MCP_UPSTREAM_ORIGIN,
  windsorMcpUpstreamUrl,
} from "./proxy";

describe("Path A same-origin /windsor-mcp rewrite", () => {
  it.each([
    ["/windsor-mcp", "/"],
    ["/windsor-mcp/", "/"],
    ["/windsor-mcp/authorize", "/authorize"],
  ])("rewrites %s to %s", (input, expected) => {
    expect(isWindsorMcpProxyPath(input)).toBe(true);
    expect(rewriteWindsorMcpProxyPath(input)).toBe(expected);
  });

  it("builds the mcp.windsor.ai upstream URL and never a destination tile host", () => {
    const upstream = windsorMcpUpstreamUrl(
      "https://crm.sabro.cloud/windsor-mcp/?x=1",
    );
    expect(upstream.origin).toBe(WINDSOR_MCP_UPSTREAM_ORIGIN);
    expect(upstream.pathname).toBe("/");
    expect(upstream.search).toBe("?x=1");
    expect(upstream.href).not.toMatch(/chatgpt|anthropic|x\.ai|grok/i);
  });

  it("defaults the browser transport to the same-origin proxy", () => {
    expect(windsorMcpRequestUrl({})).toBe(WINDSOR_MCP_SAME_ORIGIN_PROXY);
    expect(windsorMcpRequestUrl({ VITE_WINDSOR_MCP_PROXY: "direct" })).toBe(
      WINDSOR_MCP_URL,
    );
    expect(
      windsorMcpRequestUrl({ VITE_WINDSOR_MCP_PROXY: "/windsor-mcp/" }),
    ).toBe("/windsor-mcp/");
  });
});

describe("Path A proxy handler", () => {
  it("forwards POST JSON and Authorization, strips Cookie, and does not log the token", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://mcp.windsor.ai/");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer opaque-token");
      expect(headers.get("MCP-Protocol-Version")).toBe("2025-03-26");
      expect(headers.get("Cookie")).toBeNull();
      expect(headers.get("Host")).toBe("mcp.windsor.ai");
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "windsor=should-not-leak",
          },
        },
      );
    });
    const response = await handleWindsorMcpProxyRequest(
      new Request("https://crm.sabro.cloud/windsor-mcp/", {
        method: "POST",
        headers: {
          Authorization: "Bearer opaque-token",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-03-26",
          Cookie: "twenty=session",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" }),
      }),
      fetchImpl as unknown as typeof fetch,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Expose-Headers")).toMatch(
      /Mcp-Session-Id/i,
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toMatch(/twenty=session/);
  });

  it("forwards Mcp-Session-Id to Windsor and back to the browser", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Mcp-Session-Id")).toBe("sess-live");
      expect(headers.get("Authorization")).toBe("Bearer opaque-token");
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Mcp-Session-Id": "sess-live",
          },
        },
      );
    });
    const response = await handleWindsorMcpProxyRequest(
      new Request("https://crm.sabro.cloud/windsor-mcp/", {
        method: "POST",
        headers: {
          Authorization: "Bearer opaque-token",
          "Mcp-Session-Id": "sess-live",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call" }),
      }),
      fetchImpl as unknown as typeof fetch,
    );
    expect(response.headers.get("Mcp-Session-Id")).toBe("sess-live");
  });

  it("treats CORS and missing-proxy HTTP statuses as Path C FALLBACK, not PASS", () => {
    expect(isPathCFallbackFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isPathCFallbackFailure(
        new Error("Windsor MCP request failed with status 404"),
      ),
    ).toBe(true);
    expect(
      isPathCFallbackFailure(
        new Error("Windsor MCP request failed with status 405"),
      ),
    ).toBe(true);
    expect(
      isPathCFallbackFailure(new Error("Windsor write tools are denied")),
    ).toBe(false);
  });
});

describe("Path A host plan files", () => {
  it("keeps Caddy and Worker pointed at mcp.windsor.ai with cookies stripped", () => {
    expect(caddySnippet).toContain("handle_path /windsor-mcp/*");
    expect(caddySnippet).toContain("reverse_proxy https://mcp.windsor.ai");
    expect(caddySnippet).toContain(
      "header_up Authorization {http.request.header.Authorization}",
    );
    expect(caddySnippet).toContain(
      "header_up Mcp-Session-Id {http.request.header.Mcp-Session-Id}",
    );
    expect(caddySnippet).toContain("header_up -Cookie");
    expect(caddySnippet).not.toMatch(/chatgpt|claude|grok/i);
    expect(wranglerToml).toContain(
      'run_worker_first = ["/windsor-mcp", "/windsor-mcp/*", "/aigate", "/aigate/*"]',
    );
    expect(wranglerToml).toContain("sabro-windsor-web");
    expect(wranglerToml).not.toMatch(/AIGATE_AUTH_TOKEN\s*=/);
    expect(workerSource).toContain("handleWindsorMcpProxyRequest");
    expect(workerSource).toContain("isWindsorMcpProxyPath");
    expect(workerSource).toContain("handleAigateProxyRequest");
    expect(workerSource).toContain("app.sabro.cloud");
    expect(appCaddySnippet).toContain("handle_path /aigate/*");
    expect(appCaddySnippet).toContain("reverse_proxy https://bridge.makh.ai");
    expect(appCaddySnippet).toContain("{env.AIGATE_AUTH_TOKEN}");
    expect(appCaddySnippet).not.toMatch(/chatgpt|claude\.ai|grok/i);
  });
});
