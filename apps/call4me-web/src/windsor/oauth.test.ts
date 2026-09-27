import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachWindsorWebStores,
  clearPendingWindsorOAuth,
  clearWindsorAuth,
  getWindsorAuth,
  persistWindsorTokens,
  rejectWindsorApiKey,
} from "./auth";
import {
  beginWindsorBrowserConsent,
  buildWindsorAuthorizeUrl,
  completeWindsorOAuthCallback,
  createWindsorPkcePair,
  extractWindsorCallback,
  getWindsorWebRedirectUri,
  isWindsorWebCallbackRoute,
  refreshWindsorOAuthTokens,
  windsorWebConsentHoldReason,
} from "./oauth";

describe("Windsor web OAuth PKCE", () => {
  beforeEach(() => {
    attachWindsorWebStores();
    clearWindsorAuth();
    clearPendingWindsorOAuth();
  });
  afterEach(() => {
    clearPendingWindsorOAuth();
    clearWindsorAuth();
  });

  it("creates an S256 pair that never puts the verifier on the authorize URL", async () => {
    const pkce = await createWindsorPkcePair();
    expect(pkce.method).toBe("S256");
    expect(pkce.codeChallenge).not.toBe(pkce.codeVerifier);
    const redirectUri = "https://example.test/windsor-callback.html";
    const url = buildWindsorAuthorizeUrl({
      authorizationEndpoint: "https://mcp.windsor.ai/authorize",
      clientId: "client-1",
      redirectUri,
      state: "st",
      codeChallenge: pkce.codeChallenge,
    });
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain(pkce.codeChallenge);
    expect(url).not.toContain(pkce.codeVerifier);
    expect(url).toContain("resource=https%3A%2F%2Fmcp.windsor.ai%2F");
    expect(url).toContain(encodeURIComponent(redirectUri));
    expect(new URL(url).searchParams.get("scope")).toBe("offline_access create delete");
  });

  it("accepts the web callback page and rejects identity or vendor callbacks", () => {
    expect(
      isWindsorWebCallbackRoute(
        "https://pages.example/windsor-callback.html?code=a&state=b",
      ),
    ).toBe(true);
    expect(
      isWindsorWebCallbackRoute(
        "http://127.0.0.1:5173/windsor-callback.html?code=a&state=b",
      ),
    ).toBe(true);
    expect(
      isWindsorWebCallbackRoute(
        "sabro-desktop://windsor/callback?code=a&state=b",
      ),
    ).toBe(false);
    expect(
      isWindsorWebCallbackRoute(
        "https://mcp.windsor.ai/callback?code=a&state=b",
      ),
    ).toBe(false);
    expect(
      extractWindsorCallback(
        "https://pages.example/windsor-callback.html?code=wcode&state=wstate",
      ),
    ).toEqual({ code: "wcode", state: "wstate" });
    expect(getWindsorWebRedirectUri("https://pages.example/windsor.html")).toBe(
      "https://pages.example/windsor-callback.html",
    );
  });

  it("stores OAuth tokens in the web store and never accepts API keys", () => {
    persistWindsorTokens({
      accessToken: "oauth-access",
      refreshToken: "oauth-refresh",
    });
    expect(getWindsorAuth()).toEqual({
      kind: "oauth",
      accessToken: "oauth-access",
    });
    expect(() => rejectWindsorApiKey()).toThrow(/OAuth only/);
  });

  it("opens the browser after DCR and keeps OAuth scopes without faking PASS", async () => {
    const opened: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("oauth-authorization-server")) {
        return new Response(
          JSON.stringify({
            issuer: "https://mcp.windsor.ai/",
            authorization_endpoint: "https://mcp.windsor.ai/authorize",
            token_endpoint: "https://mcp.windsor.ai/token",
            registration_endpoint: "https://mcp.windsor.ai/register",
            code_challenge_methods_supported: ["S256"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (href.endsWith("/register")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          redirect_uris?: string[];
          token_endpoint_auth_method?: string;
          client_name?: string;
        };
        expect(body.token_endpoint_auth_method).toBe("none");
        expect(body.client_name).toBe("SABRO Web");
        expect(body.redirect_uris?.[0]).toContain("windsor-callback.html");
        return new Response(JSON.stringify({ client_id: "dyn-client" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    const report = await beginWindsorBrowserConsent({
      principal: "11111111-1111-4111-8111-111111111111",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redirectUri: "https://pages.example/windsor-callback.html",
      openExternal: (url) => {
        opened.push(url);
      },
    });
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://mcp.windsor.ai/authorize");
    expect(opened[0]).toContain("code_challenge_method=S256");
    expect(opened[0]).toContain("client_id=dyn-client");
    expect(new URL(opened[0] ?? "").searchParams.get("scope")).toBe("offline_access create delete");
    expect(report.status).toBe("connect_windsor");
    expect(report.liveGetData).toBe("HOLD");
    expect(windsorWebConsentHoldReason()).toContain("approve access");
    expect(windsorWebConsentHoldReason()).not.toMatch(/MCP|PKCE|OAuth|write-actions/i);
    expect(getWindsorAuth().kind).toBe("none");
  });

  it("requires a signed-in principal before opening Windsor consent", async () => {
    await expect(
      beginWindsorBrowserConsent({
        principal: "",
        openExternal: () => undefined,
      }),
    ).rejects.toThrow(/principal_id required/);
  });

  it("exchanges the callback code and persists OAuth tokens", async () => {
    const opened: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("oauth-authorization-server")) {
        return new Response(
          JSON.stringify({
            issuer: "https://mcp.windsor.ai/",
            authorization_endpoint: "https://mcp.windsor.ai/authorize",
            token_endpoint: "https://mcp.windsor.ai/token",
            registration_endpoint: "https://mcp.windsor.ai/register",
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/register")) {
        return new Response(JSON.stringify({ client_id: "dyn-client" }), {
          status: 201,
        });
      }
      if (href.endsWith("/token")) {
        const body = String(init?.body ?? "");
        expect(body).toContain("code=wcode");
        expect(body).toContain("code_verifier=");
        expect(body).not.toMatch(/api[_-]?key/i);
        return new Response(
          JSON.stringify({
            access_token: "oauth-access",
            refresh_token: "oauth-refresh",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    await beginWindsorBrowserConsent({
      principal: "11111111-1111-4111-8111-111111111111",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redirectUri: "https://pages.example/windsor-callback.html",
      openExternal: (url) => {
        opened.push(url);
      },
    });
    const state = new URL(opened[0] ?? "").searchParams.get("state");
    const completed = await completeWindsorOAuthCallback(
      `https://pages.example/windsor-callback.html?code=wcode&state=${state}`,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(completed).toBe(true);
    expect(getWindsorAuth()).toEqual({
      kind: "oauth",
      accessToken: "oauth-access",
    });
  });

  it("refreshes an OAuth access token without accepting API keys", async () => {
    persistWindsorTokens({
      accessToken: "expired-access",
      refreshToken: "refresh-1",
      clientId: "dyn-client",
    });
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("oauth-authorization-server")) {
        return new Response(
          JSON.stringify({
            issuer: "https://mcp.windsor.ai/",
            authorization_endpoint: "https://mcp.windsor.ai/authorize",
            token_endpoint: "https://mcp.windsor.ai/token",
            registration_endpoint: "https://mcp.windsor.ai/register",
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/token")) {
        const body = String(init?.body ?? "");
        expect(body).toContain("grant_type=refresh_token");
        expect(body).toContain("refresh_token=refresh-1");
        expect(body).not.toMatch(/api[_-]?key/i);
        return new Response(
          JSON.stringify({
            access_token: "fresh-access",
            refresh_token: "refresh-2",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    await expect(
      refreshWindsorOAuthTokens(fetchImpl as unknown as typeof fetch),
    ).resolves.toBe(true);
    expect(getWindsorAuth()).toEqual({
      kind: "oauth",
      accessToken: "fresh-access",
    });
  });
});
