import { describe, expect, it, vi } from "vitest";
import { attachWindsorWebStores, clearWindsorAuth } from "./auth";
import {
  callAllowlistedWindsorTool,
  connectWindsorStatus,
  createWindsorHttpTransport,
  isBrowserCorsFailure,
  parseMcpHttpBody,
  parseMcpSseMessages,
  runConnectorList,
  runLockedMetaAdsReport,
  WindsorOAuthRequiredError,
  windsorUnauthorizedDetail,
} from "./mcp";
import { PATH_C_FALLBACK_HOLD, WINDSOR_LOCKED_ACCOUNT_ID } from "./policy";

describe("Windsor web MCP deny and HOLD", () => {
  it("denies writes before transport runs", async () => {
    const call = vi.fn();
    await expect(
      callAllowlistedWindsorTool({
        principal: "11111111-1111-4111-8111-111111111111",
        auth: { kind: "oauth", accessToken: "opaque" },
        tool: "execute_action",
        args: { action: "pause_campaign" },
        transport: { call },
        writeActionsToggle: "OFF",
      }),
    ).rejects.toThrow(/denied/);
    expect(call).not.toHaveBeenCalled();
  });

  it("requires a trusted principal before tools", async () => {
    await expect(
      callAllowlistedWindsorTool({
        principal: "",
        auth: { kind: "oauth", accessToken: "opaque" },
        tool: "get_current_user",
        transport: { call: vi.fn() },
      }),
    ).rejects.toThrow(/principal_id required/);
  });

  it("stops at Connect Windsor when OAuth is missing", async () => {
    const result = await runLockedMetaAdsReport({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "none" },
    });
    expect(result.reply.adsReport?.status).toBe("connect_windsor");
    expect(connectWindsorStatus().status).toBe("connect_windsor");
  });

  it("allows execute_action only when write-actions are ON", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    await expect(
      callAllowlistedWindsorTool({
        principal: "11111111-1111-4111-8111-111111111111",
        auth: { kind: "oauth", accessToken: "opaque" },
        tool: "execute_action",
        args: {
          connector: "facebook",
          action: "pause_campaign",
          account: WINDSOR_LOCKED_ACCOUNT_ID,
        },
        transport: { call },
        writeActionsToggle: "ON",
      }),
    ).resolves.toEqual({ value: { ok: true } });
    expect(call).toHaveBeenCalledWith("execute_action", {
      connector: "facebook",
      action: "pause_campaign",
      account: WINDSOR_LOCKED_ACCOUNT_ID,
    });
  });

  it("oauth + writes ON + mock transport still runs campaign get_data", async () => {
    const transport = {
      call: vi.fn(async (tool: string) => {
        if (tool === "get_connectors") {
          return [
            {
              id: "facebook",
              accounts: [
                { id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" },
                { id: "1401505225224082" },
                { id: "272592740320720" },
              ],
            },
          ];
        }
        return { data: [{ campaign: "Worst", spend: "99", clicks: "1" }] };
      }),
    };
    const result = await runLockedMetaAdsReport({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
      writeActionsToggle: "ON",
    });
    expect(transport.call).toHaveBeenCalledWith(
      "get_data",
      expect.objectContaining({
        connector: "facebook",
        accounts: [WINDSOR_LOCKED_ACCOUNT_ID],
      }),
    );
    expect(result.reply.adsReport?.status).toBe("ok");
    expect(result.reply.adsReport?.worstCampaignName).toBe("Worst");
  });

  it("oauth + writes OFF + mock transport runs campaign get_data", async () => {
    const transport = {
      call: vi.fn(async (tool: string) => {
        if (tool === "get_connectors") {
          return [
            {
              id: "facebook",
              accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
            },
          ];
        }
        return { data: [{ campaign: "Worst", spend: "99", clicks: "1" }] };
      }),
    };
    const result = await runLockedMetaAdsReport({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
      writeActionsToggle: "OFF",
    });
    expect(transport.call).toHaveBeenCalledWith(
      "get_data",
      expect.objectContaining({
        connector: "facebook",
        accounts: [WINDSOR_LOCKED_ACCOUNT_ID],
      }),
    );
    expect(result.reply.adsReport?.status).toBe("ok");
    expect(result.reply.adsReport?.trust).toBe("UNTRUSTED_EXTERNAL");
    expect(result.reply.adsReport?.worstCampaignName).toBe("Worst");
  });

  it("lists connectors with include_actions forced false", async () => {
    const transport = {
      call: vi.fn(async () => [
        {
          id: "facebook",
          accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
        },
      ]),
    };
    const result = await runConnectorList({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
    });
    expect(transport.call).toHaveBeenCalledWith("get_connectors", {
      include_not_yet_connected: false,
      include_actions: false,
      include_options: false,
    });
    expect(result.reply.adsReport?.status).toBe("ok");
  });

  it("lists connectors from a FastMCP { data } envelope as UNTRUSTED_EXTERNAL rows", async () => {
    const transport = {
      call: vi.fn(async () => ({
        data: [
          {
            id: "facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      })),
    };
    const result = await runConnectorList({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
    });
    expect(result.reply.adsReport?.trust).toBe("UNTRUSTED_EXTERNAL");
    expect(result.reply.adsReport?.status).toBe("ok");
    expect(result.reply.adsReport?.rows[0]?.id).toBe("facebook");
    expect(result.reply.text).toContain("connected Meta accounts");
  });

  it("HOLDs list connectors with payload keys when the envelope is not connectors", async () => {
    const transport = {
      call: vi.fn(async () => ({ ok: true, meta: { count: 0 } })),
    };
    const result = await runConnectorList({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
    });
    expect(result.reply.adsReport?.status).toBe("hold");
    expect(result.reply.text).toBe(
      "Ambiguous get_connectors payload (keys: meta,ok). HOLD.",
    );
  });

  it("runs worst Meta when facebook is named and the locked account is present", async () => {
    const transport = {
      call: vi.fn(async (tool: string) => {
        if (tool === "get_connectors") {
          return {
            result: {
              connectors: [
                {
                  name: "Facebook",
                  accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
                },
              ],
            },
          };
        }
        return { data: [{ campaign: "Worst", spend: "99", clicks: "1" }] };
      }),
    };
    const result = await runLockedMetaAdsReport({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
      writeActionsToggle: "OFF",
    });
    expect(result.reply.adsReport?.status).toBe("ok");
    expect(result.reply.adsReport?.worstCampaignName).toBe("Worst");
  });

  it("stamps Path C FALLBACK when the browser CORS-blocks MCP POST", async () => {
    attachWindsorWebStores();
    clearWindsorAuth();
    const result = await runLockedMetaAdsReport({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport: {
        call: async () => {
          throw new TypeError("Failed to fetch");
        },
      },
    });
    expect(isBrowserCorsFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(result.reply.adsReport?.status).toBe("hold");
    expect(result.reply.text).toBe(PATH_C_FALLBACK_HOLD);
    expect(result.reply.text).toContain("not MCP PASS");
    expect(result.reply.text).toContain("FALLBACK");
  });

  it("stamps Path C FALLBACK when the same-origin proxy is missing (404)", async () => {
    const result = await runConnectorList({
      principal: "11111111-1111-4111-8111-111111111111",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport: {
        call: async () => {
          throw new Error("Windsor MCP request failed with status 404");
        },
      },
    });
    expect(result.reply.adsReport?.status).toBe("hold");
    expect(result.reply.text).toBe(PATH_C_FALLBACK_HOLD);
  });
});

describe("Windsor Streamable HTTP transport", () => {
  function jsonRpcResult(result: unknown, headers?: HeadersInit): Response {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  it("parses SSE data frames used by FastMCP Streamable HTTP", () => {
    const text = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"ok":true}}}',
      "",
    ].join("\n");
    expect(parseMcpSseMessages(text)).toEqual([
      { jsonrpc: "2.0", id: 1, result: { structuredContent: { ok: true } } },
    ]);
    expect(parseMcpHttpBody("text/event-stream", text)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { structuredContent: { ok: true } },
    });
  });

  it("surfaces Windsor invalid_token text instead of a bare WINDSOR_OAUTH_REQUIRED", () => {
    expect(
      windsorUnauthorizedDetail(
        JSON.stringify({
          error: "invalid_token",
          error_description:
            "Authentication failed. The provided bearer token is invalid.",
        }),
      ),
    ).toContain("provided bearer token is invalid");
  });

  it("handshakes initialize + session before tools/call", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
      };
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer opaque");
      expect(headers.get("MCP-Protocol-Version")).toBe("2025-03-26");
      expect(headers.get("Accept")).toContain("text/event-stream");
      if (body.method === "initialize") {
        expect(headers.get("Mcp-Session-Id")).toBeNull();
        return jsonRpcResult(
          {
            protocolVersion: "2025-03-26",
            capabilities: {},
            serverInfo: { name: "windsor" },
          },
          { "Mcp-Session-Id": "sess-1" },
        );
      }
      if (body.method === "notifications/initialized") {
        expect(headers.get("Mcp-Session-Id")).toBe("sess-1");
        return new Response(null, {
          status: 202,
          headers: { "Mcp-Session-Id": "sess-1" },
        });
      }
      expect(body.method).toBe("tools/call");
      expect(headers.get("Mcp-Session-Id")).toBe("sess-1");
      expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
        params: { name: "get_connectors" },
      });
      return jsonRpcResult({
        structuredContent: [
          { id: "facebook", accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID }] },
        ],
      });
    });
    const transport = createWindsorHttpTransport({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAuth: () => ({ kind: "oauth", accessToken: "opaque" }),
      mcpUrl: "/windsor-mcp/",
    });
    const value = await transport.call("get_connectors", {
      include_actions: false,
    });
    expect(value).toEqual([
      { id: "facebook", accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID }] },
    ]);
    const methods = fetchImpl.mock.calls.map((call) => {
      const body = JSON.parse(
        String((call[1] as RequestInit | undefined)?.body ?? "{}"),
      ) as {
        method?: string;
      };
      return body.method;
    });
    expect(methods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
  });

  it("parses a tools/call SSE response after handshake", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
      };
      if (body.method === "initialize") {
        return jsonRpcResult({}, { "Mcp-Session-Id": "sess-sse" });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      return new Response(
        'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"structuredContent":{"data":[{"id":"facebook"}]}}}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    });
    const transport = createWindsorHttpTransport({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAuth: () => ({ kind: "oauth", accessToken: "opaque" }),
    });
    await expect(transport.call("get_connectors", {})).resolves.toEqual({
      data: [{ id: "facebook" }],
    });
  });

  it("includes Windsor 401 error_description when the token is rejected after Connect", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "invalid_token",
          error_description:
            "Authentication failed. The provided bearer token is invalid.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });
    const transport = createWindsorHttpTransport({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAuth: () => ({ kind: "oauth", accessToken: "opaque" }),
    });
    await expect(transport.call("get_connectors", {})).rejects.toBeInstanceOf(
      WindsorOAuthRequiredError,
    );
    await expect(transport.call("get_connectors", {})).rejects.toThrow(
      /provided bearer token is invalid/,
    );
  });

  it("refreshes once on 401 then completes the handshake", async () => {
    let token = "expired";
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
      };
      if (headers.get("Authorization") === "Bearer expired") {
        return new Response(JSON.stringify({ error: "invalid_token" }), {
          status: 401,
        });
      }
      if (body.method === "initialize") {
        return jsonRpcResult({}, { "Mcp-Session-Id": "sess-2" });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      return jsonRpcResult({ structuredContent: { data: [] } });
    });
    const refreshAuth = vi.fn(async () => {
      token = "fresh";
      return true;
    });
    const transport = createWindsorHttpTransport({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAuth: () => ({ kind: "oauth", accessToken: token }),
      refreshAuth,
    });
    await expect(transport.call("get_connectors", {})).resolves.toEqual({
      data: [],
    });
    expect(refreshAuth).toHaveBeenCalledOnce();
  });
});
