import { describe, expect, it } from "vitest";
import {
  assertWindsorOAuthOnly,
  assertWindsorToolAllowed,
  inspectFacebookAccountsFromConnectors,
  inspectWindsorToolArguments,
  isClaudeDirectoryConnector,
  isMetaAdsPerformanceQuestion,
  isWindsorWriteTool,
  liveGetDataAllowed,
  lockWindsorAccounts,
  PATH_C_FALLBACK_HOLD,
  requireTrustedPrincipal,
  WINDSOR_ALLOWED_ACCOUNT_IDS,
  WINDSOR_ALLOWED_TOOLS,
  WINDSOR_LOCKED_ACCOUNT_ID,
  WINDSOR_MCP_URL,
  windsorHostConfig,
} from "./policy";

const SECONDARY_ACCOUNT_ID = "1401505225224082";
const TERTIARY_ACCOUNT_ID = "272592740320720";

describe("CR-WINDSOR-MCP-WEB-001 allowlist", () => {
  it("allows the five read tools plus list_actions/execute_action when write-actions are ON", () => {
    expect([...WINDSOR_ALLOWED_TOOLS]).toEqual([
      "get_current_user",
      "get_connectors",
      "get_options",
      "get_fields",
      "get_data",
      "list_actions",
      "execute_action",
    ]);
    for (const name of WINDSOR_ALLOWED_TOOLS) {
      expect(assertWindsorToolAllowed(name, "ON")).toBe(name);
    }
    expect(() => assertWindsorToolAllowed("list_actions", "OFF")).toThrow(
      /denied/,
    );
    expect(() => assertWindsorToolAllowed("execute_action", "OFF")).toThrow(
      /denied/,
    );
    expect(() => assertWindsorToolAllowed("delete")).toThrow(
      /allowlist|denied/,
    );
    expect(() => assertWindsorToolAllowed("create_custom_field")).toThrow(
      /allowlist|denied/,
    );
    expect(() => assertWindsorToolAllowed("get_windsor_login_url")).toThrow(
      /allowlist/,
    );
    expect(isWindsorWriteTool("list_actions")).toBe(true);
    expect(isWindsorWriteTool("execute_action")).toBe(true);
    expect(isWindsorWriteTool("create_campaign")).toBe(true);
  });

  it("uses Streamable HTTP at mcp.windsor.ai and never a Claude directory connector", () => {
    const config = windsorHostConfig();
    expect(config.url).toBe(WINDSOR_MCP_URL);
    expect(config.transport).toBe("streamable_http");
    expect(config.claudeDirectoryConnector).toBe(false);
    expect(isClaudeDirectoryConnector(config.claudeDirectoryConnector)).toBe(
      false,
    );
    expect(config.writeActionsToggle).toBe("ON");
    expect(PATH_C_FALLBACK_HOLD).toContain("PATH C FALLBACK (not MCP PASS)");
    expect(PATH_C_FALLBACK_HOLD).toContain("/windsor-mcp");
    expect(PATH_C_FALLBACK_HOLD).not.toContain("INTERIM");
  });
});

describe("CR-WINDSOR-MCP-WEB-001 OAuth only", () => {
  it("rejects API keys and missing tokens", () => {
    expect(() =>
      assertWindsorOAuthOnly({ kind: "api_key", apiKey: "from-screenshot" }),
    ).toThrow(/OAuth only/);
    expect(() => assertWindsorOAuthOnly({ kind: "none" })).toThrow(
      "WINDSOR_OAUTH_REQUIRED",
    );
    expect(
      assertWindsorOAuthOnly({ kind: "oauth", accessToken: "opaque" }),
    ).toBe("opaque");
  });
});

describe("CR-WINDSOR-MCP-WEB-001 account lock", () => {
  it("rejects missing connector, empty-all, and ids outside the three-id allowlist", () => {
    expect(lockWindsorAccounts({ connector: "facebook" }).ok).toBe(false);
    expect(
      lockWindsorAccounts({
        connector: "facebook",
        accounts: ["4192435737656223", "999"],
      }).ok,
    ).toBe(false);
    expect(
      lockWindsorAccounts({
        connector: "facebook",
        accounts: ["act_4192435737656223"],
      }),
    ).toEqual({ ok: true, accountId: WINDSOR_LOCKED_ACCOUNT_ID });
    expect(
      lockWindsorAccounts({
        connector: "facebook",
        accounts: [...WINDSOR_ALLOWED_ACCOUNT_IDS],
      }),
    ).toEqual({ ok: true, accountId: WINDSOR_LOCKED_ACCOUNT_ID });
    expect(
      lockWindsorAccounts({
        connector: "facebook",
        accounts: [SECONDARY_ACCOUNT_ID, TERTIARY_ACCOUNT_ID],
      }),
    ).toEqual({ ok: true, accountId: SECONDARY_ACCOUNT_ID });
  });

  it("forces include_actions false when writes are OFF and injects the primary account on get_data", () => {
    expect(
      inspectWindsorToolArguments(
        "get_connectors",
        { include_actions: true },
        "OFF",
      ),
    ).toEqual({
      ok: true,
      args: {
        include_not_yet_connected: false,
        include_actions: false,
        include_options: false,
      },
    });
    expect(
      inspectFacebookAccountsFromConnectors([
        {
          id: "facebook",
          accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
        },
      ]),
    ).toEqual({ ok: true, accountId: WINDSOR_LOCKED_ACCOUNT_ID });
  });

  it.each([
    {
      name: "array",
      payload: [
        {
          id: "facebook",
          accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
        },
      ],
    },
    {
      name: "{ connectors }",
      payload: {
        connectors: [
          {
            id: "facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      },
    },
    {
      name: "{ data } connector items",
      payload: {
        data: [
          {
            id: "facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      },
    },
    {
      name: "nested result.connectors",
      payload: {
        result: {
          connectors: [
            {
              id: "facebook",
              accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
            },
          ],
        },
      },
    },
    {
      name: "nested result array",
      payload: {
        result: [
          {
            id: "facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      },
    },
    {
      name: "name Facebook",
      payload: {
        data: [
          {
            name: "Facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      },
    },
    {
      name: "slug facebook",
      payload: {
        data: [
          { slug: "facebook", accounts: [{ id: "act_4192435737656223" }] },
        ],
      },
    },
  ])("accepts FastMCP $name without inventing accounts", ({ payload }) => {
    expect(inspectFacebookAccountsFromConnectors(payload)).toEqual({
      ok: true,
      accountId: WINDSOR_LOCKED_ACCOUNT_ID,
    });
  });

  it("HOLDs unexpected accounts and does not guess an id from facebook-only rows", () => {
    expect(
      inspectFacebookAccountsFromConnectors({
        data: [{ id: "facebook", accounts: [{ id: "111", name: "other" }] }],
      }).ok,
    ).toBe(false);
    expect(
      inspectFacebookAccountsFromConnectors({
        data: [{ name: "facebook" }],
      }),
    ).toEqual({
      ok: false,
      hold: true,
      reason: "No connected Meta account is available.",
    });
  });

  it("PASSes any subset of the three allowlisted ids and HOLDs unexpected ids", () => {
    expect(
      inspectFacebookAccountsFromConnectors([
        {
          id: "facebook",
          accounts: [
            { id: SECONDARY_ACCOUNT_ID, name: "other-brand" },
            { id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" },
            { id: TERTIARY_ACCOUNT_ID },
          ],
        },
      ]),
    ).toEqual({ ok: true, accountId: WINDSOR_LOCKED_ACCOUNT_ID });
    expect(
      inspectFacebookAccountsFromConnectors([
        {
          id: "facebook",
          accounts: [{ id: SECONDARY_ACCOUNT_ID, name: "not-mmpl" }],
        },
      ]),
    ).toEqual({ ok: true, accountId: SECONDARY_ACCOUNT_ID });
    expect(
      inspectFacebookAccountsFromConnectors([
        {
          id: "facebook",
          accounts: [
            { id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" },
            { id: "999" },
          ],
        },
      ]).ok,
    ).toBe(false);
    expect(
      inspectWindsorToolArguments("get_data", {
        connector: "facebook",
        accounts: [SECONDARY_ACCOUNT_ID],
        fields: ["spend"],
      }),
    ).toMatchObject({
      ok: true,
      args: { accounts: [SECONDARY_ACCOUNT_ID] },
    });
  });

  it("includes top-level keys when the envelope is not a connector list", () => {
    const result = inspectFacebookAccountsFromConnectors({
      ok: true,
      meta: { count: 1 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(
        "Ambiguous get_connectors payload (keys: meta,ok). HOLD.",
      );
    }
  });

  it("accepts { data: [...] } connector items the same way asRows unwraps get_data", () => {
    expect(
      inspectFacebookAccountsFromConnectors({
        data: [
          {
            id: "facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      }),
    ).toEqual({ ok: true, accountId: WINDSOR_LOCKED_ACCOUNT_ID });
  });

  it("accepts { connectors: [...] } and matches facebook by name", () => {
    expect(
      inspectFacebookAccountsFromConnectors({
        connectors: [
          {
            name: "Facebook",
            accounts: [{ id: WINDSOR_LOCKED_ACCOUNT_ID, name: "mmpl" }],
          },
        ],
      }),
    ).toEqual({ ok: true, accountId: WINDSOR_LOCKED_ACCOUNT_ID });
  });

  it("HOLDs { data, meta } campaign rows with keys only — no dump", () => {
    const result = inspectFacebookAccountsFromConnectors({
      data: [{ campaign: "x", spend: "1" }],
      meta: { count: 1 },
    });
    expect(result).toEqual({
      ok: false,
      hold: true,
      reason: "Ambiguous get_connectors payload (keys: data,meta). HOLD.",
    });
  });
});

describe("CR-WINDSOR-MCP-WEB-001 principal gate", () => {
  it("requires a trusted principal and keeps get_data READY while write-actions are ON", () => {
    expect(() => requireTrustedPrincipal("")).toThrow(/principal_id required/);
    expect(() => requireTrustedPrincipal("sabro-local-abc")).toThrow(
      /principal_id required/,
    );
    expect(
      requireTrustedPrincipal("11111111-1111-4111-8111-111111111111"),
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(liveGetDataAllowed("OFF")).toBe(true);
    expect(liveGetDataAllowed("ON")).toBe(true);
    expect(liveGetDataAllowed("UNVERIFIED")).toBe(false);
    expect(windsorHostConfig().liveGetData).toBe("READY");
    expect(
      inspectWindsorToolArguments(
        "list_actions",
        { connector: "facebook" },
        "ON",
      ),
    ).toEqual({ ok: true, args: { connector: "facebook" } });
    expect(
      inspectWindsorToolArguments(
        "execute_action",
        {
          connector: "facebook",
          action: "pause_campaign",
          account: WINDSOR_LOCKED_ACCOUNT_ID,
        },
        "ON",
      ),
    ).toEqual({
      ok: true,
      args: {
        connector: "facebook",
        action: "pause_campaign",
        account: WINDSOR_LOCKED_ACCOUNT_ID,
      },
    });
    expect(() =>
      inspectWindsorToolArguments(
        "list_actions",
        { connector: "facebook" },
        "OFF",
      ),
    ).toThrow(/denied/);
    expect(
      isMetaAdsPerformanceQuestion(
        "Find my worst-performing Meta Ads campaign in the last 30 days",
      ),
    ).toBe(true);
  });
});
