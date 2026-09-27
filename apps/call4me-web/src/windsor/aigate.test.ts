import { describe, expect, it, vi } from "vitest";
import {
  AIGATE_MODEL,
  aigateRequestUrl,
  createAigateHttpClient,
  parseAigateResponse,
  windsorAigateTools,
} from "./aigate";
import {
  AIGATE_MESSAGES_PATH,
  AIGATE_UNAVAILABLE_HOLD,
  aigateUpstreamUrl,
  BRIDGE_UPSTREAM_ORIGIN,
  handleAigateProxyRequest,
  isAigateProxyPath,
  rewriteAigateProxyPath,
} from "./aigate-proxy";
import { WINDSOR_ALLOWED_TOOLS } from "./policy";

describe("aigate browser client", () => {
  it("defaults to same-origin /aigate and never a vendor chat tile", () => {
    expect(aigateRequestUrl({})).toBe(AIGATE_MESSAGES_PATH);
    expect(aigateRequestUrl({ VITE_AIGATE_PROXY: "direct" })).toBe(
      `${BRIDGE_UPSTREAM_ORIGIN}/v1/messages`,
    );
    expect(windsorAigateTools().map((tool) => tool.name)).toEqual([
      ...WINDSOR_ALLOWED_TOOLS,
    ]);
    expect(AIGATE_MESSAGES_PATH).not.toMatch(/chatgpt|claude\.ai|grok|x\.ai/i);
    expect(AIGATE_MODEL).toBe("claude-oauth-sonnet");
    expect(AIGATE_MODEL).not.toBe("sonnet");
    expect(AIGATE_MODEL).not.toMatch(/GATE-VK|vk-mint|vk_mint/i);
  });

  it("parses Anthropic content blocks and simple text payloads", () => {
    expect(
      parseAigateResponse({
        content: [
          { type: "text", text: "Hello" },
          { type: "tool_use", id: "1", name: "get_data", input: { connector: "facebook" } },
        ],
      }).content,
    ).toHaveLength(2);
    expect(parseAigateResponse({ text: "plain" }).content).toEqual([
      { type: "text", text: "plain" },
    ]);
  });

  it("maps 503 from the host proxy to AIGATE HOLD without leaking tokens", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: AIGATE_UNAVAILABLE_HOLD }), {
        status: 503,
      });
    });
    const client = createAigateHttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.complete({
        model: AIGATE_MODEL,
        max_tokens: 16,
        system: "test",
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      }),
    ).rejects.toThrow(/AIGATE HOLD/);
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toMatch(
      /sk-|GATE-VK|Bearer [A-Za-z0-9]/,
    );
  });
});

describe("same-origin /aigate proxy", () => {
  it.each([
    ["/aigate", "/"],
    ["/aigate/", "/"],
    ["/aigate/v1/messages", "/v1/messages"],
  ])("rewrites %s to %s", (input, expected) => {
    expect(isAigateProxyPath(input)).toBe(true);
    expect(rewriteAigateProxyPath(input)).toBe(expected);
  });

  it("injects the host token, strips cookies and browser Authorization, and does not log secrets", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://bridge.makh.ai/v1/messages");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer host-token");
      expect(headers.get("x-api-key")).toBe("host-token");
      expect(headers.get("Cookie")).toBeNull();
      expect(headers.get("Host")).toBe("bridge.makh.ai");
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
        headers: { "Set-Cookie": "bridge=nope" },
      });
    });
    const response = await handleAigateProxyRequest(
      new Request("https://app.sabro.cloud/aigate/v1/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer identity-jwt",
          Cookie: "twenty=session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: AIGATE_MODEL, messages: [] }),
      }),
      { authToken: "host-token", fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(aigateUpstreamUrl("https://app.sabro.cloud/aigate/v1/messages").origin).toBe(
      BRIDGE_UPSTREAM_ORIGIN,
    );
    const serialized = JSON.stringify(fetchImpl.mock.calls);
    expect(serialized).not.toContain("identity-jwt");
    expect(serialized).not.toContain("twenty=session");
  });

  it("returns 503 HOLD when the host token is missing", async () => {
    const fetchImpl = vi.fn();
    const response = await handleAigateProxyRequest(
      new Request("https://app.sabro.cloud/aigate/v1/messages", {
        method: "POST",
        body: "{}",
      }),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("AIGATE HOLD");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
