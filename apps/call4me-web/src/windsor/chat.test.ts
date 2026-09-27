import { describe, expect, it, vi } from "vitest";
import { AIGATE_MODEL } from "./aigate";
import { AIGATE_UNAVAILABLE_HOLD } from "./aigate-proxy";
import {
  handleWebChat,
  isMetaAdsRelatedQuestion,
  isMetaAdsWriteQuestion,
  SABRO_CHAT_UNAVAILABLE_HOLD,
  sabroChatPolicyBanner,
  sabroWebChatSystemPrompt,
  showWindsorProveUi,
} from "./chat";
import chatSource from "./chat.ts?raw";
import {
  WINDSOR_ALLOWED_ACCOUNT_IDS,
  WINDSOR_ALLOWED_TOOLS,
  WINDSOR_LOCKED_ACCOUNT_ID,
} from "./policy";

const PRINCIPAL = "11111111-1111-4111-8111-111111111111";

describe("CR-SABRO-SHELL-CHAT-WINDSOR-MCP-001 routing", () => {
  it("reuses the policy allowlist instead of forking a second one", () => {
    expect(chatSource).toContain('from "./policy"');
    expect(chatSource).toContain("WINDSOR_ALLOWED_TOOLS");
    expect(chatSource).toContain("WINDSOR_ALLOWED_ACCOUNT_IDS");
    expect(chatSource).not.toMatch(/WINDSOR_ALLOWED_TOOLS\s*=/);
    expect(chatSource).not.toMatch(/WINDSOR_ALLOWED_ACCOUNT_IDS\s*=/);
    expect(sabroWebChatSystemPrompt("ON")).toContain(
      WINDSOR_ALLOWED_TOOLS.join(", "),
    );
    expect(sabroWebChatSystemPrompt("ON")).toContain(
      WINDSOR_ALLOWED_ACCOUNT_IDS.join(", "),
    );
    expect(sabroWebChatSystemPrompt("ON")).toContain("Ice workspaces");
    expect(sabroWebChatSystemPrompt("ON")).toMatch(
      /do not send people to ChatGPT, Claude, or Grok/,
    );
    expect(sabroWebChatSystemPrompt("ON")).not.toMatch(
      /bridge \/ aigate|Windsor is MCP|write-actions/i,
    );
    expect(sabroWebChatSystemPrompt("ON")).not.toMatch(
      /open chatgpt|claude\.ai|grok\.com/i,
    );
    expect(sabroWebChatSystemPrompt("ON")).not.toMatch(/57332|VoiceLink/i);
    expect(sabroChatPolicyBanner("ON")).toContain("connected Meta accounts");
    expect(sabroChatPolicyBanner("ON")).not.toMatch(/bridge|aigate|MCP|PKCE/i);
  });

  it.each([
    ["worst Meta ads campaign last 30 days", false],
    ["pause the worst campaign", true],
    ["list actions for facebook ads", true],
    ["hello there", false],
  ])("classifies %s write=%s", (prompt, write) => {
    expect(isMetaAdsWriteQuestion(prompt)).toBe(write);
    if (prompt === "hello there") {
      expect(isMetaAdsRelatedQuestion(prompt)).toBe(false);
    }
  });

  it("shows prove List/Worst only behind ?prove=1 or the flag", () => {
    expect(showWindsorProveUi("")).toBe(false);
    expect(showWindsorProveUi("?prove=1")).toBe(true);
    expect(
      showWindsorProveUi("/windsor.html", { VITE_WINDSOR_PROVE_UI: "1" }),
    ).toBe(true);
  });

  it("requires a trusted principal before chat", async () => {
    await expect(
      handleWebChat({
        principal: "",
        prompt: "hello",
        auth: { kind: "oauth", accessToken: "opaque" },
        aigate: { complete: vi.fn() },
        transport: { call: vi.fn() },
      }),
    ).rejects.toThrow(/principal_id required/);
  });

  it("routes performance questions to Windsor get_data without aigate", async () => {
    const aigate = { complete: vi.fn() };
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
    const result = await handleWebChat({
      principal: PRINCIPAL,
      prompt: "What is the worst Meta ads campaign in the last 30 days?",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
      aigate,
    });
    expect(aigate.complete).not.toHaveBeenCalled();
    expect(transport.call).toHaveBeenCalledWith(
      "get_data",
      expect.objectContaining({
        connector: "facebook",
        accounts: [WINDSOR_LOCKED_ACCOUNT_ID],
      }),
    );
    expect(result.adsReport?.status).toBe("ok");
    expect(result.text).toContain("connected Meta accounts");
  });

  it("asks aigate for freehand chat and executes allowlisted Windsor tools", async () => {
    const transport = {
      call: vi.fn(async (tool: string) => {
        if (tool === "list_actions") return { actions: ["pause_campaign"] };
        return { ok: true };
      }),
    };
    const aigate = {
      complete: vi.fn(
        async (request: { model: string; tools: Array<{ name: string }> }) => {
          expect(request.model).toBe(AIGATE_MODEL);
          expect(request.model).toBe("claude-oauth-sonnet");
          expect(request.tools.map((tool) => tool.name)).toEqual([
            ...WINDSOR_ALLOWED_TOOLS,
          ]);
          if (aigate.complete.mock.calls.length === 1) {
            return {
              stop_reason: "tool_use",
              content: [
                {
                  type: "tool_use" as const,
                  id: "call-1",
                  name: "list_actions",
                  input: { connector: "facebook" },
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: "UNTRUSTED_EXTERNAL pause_campaign is available.",
              },
            ],
          };
        },
      ),
    };
    const result = await handleWebChat({
      principal: PRINCIPAL,
      prompt: "Which Windsor write actions exist for facebook ads?",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
      aigate,
      writeActionsToggle: "ON",
    });
    expect(transport.call).toHaveBeenCalledWith("list_actions", {
      connector: "facebook",
    });
    expect(result.text).toContain("pause_campaign");
  });

  it("denies execute_action in the tool loop when write-actions are OFF", async () => {
    const transport = { call: vi.fn() };
    const aigate = {
      complete: vi.fn(async () => {
        if (aigate.complete.mock.calls.length === 1) {
          return {
            content: [
              {
                type: "tool_use" as const,
                id: "call-2",
                name: "execute_action",
                input: {
                  connector: "facebook",
                  action: "pause_campaign",
                  account: WINDSOR_LOCKED_ACCOUNT_ID,
                },
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: "Write denied." }],
        };
      }),
    };
    const result = await handleWebChat({
      principal: PRINCIPAL,
      prompt: "pause the worst campaign now",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport,
      aigate,
      writeActionsToggle: "OFF",
    });
    expect(transport.call).not.toHaveBeenCalled();
    expect(result.text).toBe("Write denied.");
  });

  it("holds ordinary chat when aigate is missing and does not invent a model tile", async () => {
    const result = await handleWebChat({
      principal: PRINCIPAL,
      prompt: "Summarize yesterday's standup",
      auth: { kind: "oauth", accessToken: "opaque" },
      transport: { call: vi.fn() },
      aigate: {
        complete: vi.fn(async () => {
          throw new Error(AIGATE_UNAVAILABLE_HOLD);
        }),
      },
    });
    expect(result.adsReport?.status).toBe("hold");
    expect(result.text).toBe(SABRO_CHAT_UNAVAILABLE_HOLD);
    expect(result.text).not.toMatch(
      /aigate|bridge|mcp|chatgpt|claude\.ai|grok/i,
    );
  });

  it("stops at Connect Windsor for ads chat without OAuth", async () => {
    const result = await handleWebChat({
      principal: PRINCIPAL,
      prompt: "worst Meta ads campaign last 30 days",
      auth: { kind: "none" },
      aigate: { complete: vi.fn() },
      transport: { call: vi.fn() },
    });
    expect(result.adsReport?.status).toBe("connect_windsor");
  });
});
