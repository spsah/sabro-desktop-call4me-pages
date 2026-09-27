export const WINDSOR_MCP_URL = "https://mcp.windsor.ai/";
export const WINDSOR_MCP_TRANSPORT = "streamable_http" as const;
export const WINDSOR_CONNECTOR_ID = "facebook";
export const WINDSOR_LOCKED_ACCOUNT_ID = "4192435737656223";
export const WINDSOR_LOCKED_ACCOUNT_NAME = "mmpl";
export const WINDSOR_ALLOWED_ACCOUNT_IDS = [
  WINDSOR_LOCKED_ACCOUNT_ID,
  "1401505225224082",
  "272592740320720",
] as const;
export const WINDSOR_ADAPTER_ID = "sabro-windsor-mcp-web-ro-v1";

export const WINDSOR_ALLOWED_TOOLS = [
  "get_current_user",
  "get_connectors",
  "get_options",
  "get_fields",
  "get_data",
  "list_actions",
  "execute_action",
] as const;

export type WindsorAllowedTool = (typeof WINDSOR_ALLOWED_TOOLS)[number];

const GET_DATA_ARG_KEYS = new Set([
  "connector",
  "fields",
  "accounts",
  "date_from",
  "date_to",
  "date_preset",
  "filters",
  "options",
  "date_filters",
]);
const GET_FIELDS_ARG_KEYS = new Set(["connector", "fields", "accounts"]);
const GET_OPTIONS_ARG_KEYS = new Set(["connector", "accounts"]);
const GET_CONNECTORS_ARG_KEYS = new Set([
  "include_not_yet_connected",
  "include_actions",
  "include_options",
]);
const GET_CURRENT_USER_ARG_KEYS = new Set<string>();
const LIST_ACTIONS_ARG_KEYS = new Set(["connector"]);
const EXECUTE_ACTION_ARG_KEYS = new Set([
  "connector",
  "action",
  "account",
  "params",
]);
const WINDSOR_ALLOWED_ACCOUNT_ID_SET = new Set<string>(
  WINDSOR_ALLOWED_ACCOUNT_IDS,
);

export type WindsorAuth =
  | { kind: "oauth"; accessToken: string }
  | { kind: "api_key"; apiKey: string }
  | { kind: "none" };

export type AccountLockResult =
  | { ok: true; accountId: string }
  | { ok: false; hold: true; reason: string };

export type WindsorWriteActionsToggle = "OFF" | "ON" | "UNVERIFIED";

/** Attested write-actions ON. Live campaign get_data stays allowed; writes use list_actions + execute_action. */
export const WINDSOR_WRITE_ACTIONS_TOGGLE: WindsorWriteActionsToggle = "ON";

/** User-facing Ice ≠ MMPL. Keep this in product language — not “tenants”. */
export const ICE_NOT_MMPL_COPY = "Ice workspaces are not MMPL ads accounts.";

export function liveGetDataAllowed(
  toggle: WindsorWriteActionsToggle = WINDSOR_WRITE_ACTIONS_TOGGLE,
): boolean {
  return toggle !== "UNVERIFIED";
}

export function isClaudeDirectoryConnector(value: unknown): boolean {
  return value === true;
}

export function windsorHostConfig(): {
  url: string;
  transport: typeof WINDSOR_MCP_TRANSPORT;
  claudeDirectoryConnector: false;
  writeActionsToggle: WindsorWriteActionsToggle;
  liveGetData: "HOLD" | "READY";
} {
  return {
    url: WINDSOR_MCP_URL,
    transport: WINDSOR_MCP_TRANSPORT,
    claudeDirectoryConnector: false,
    writeActionsToggle: WINDSOR_WRITE_ACTIONS_TOGGLE,
    liveGetData: liveGetDataAllowed() ? "READY" : "HOLD",
  };
}

export function isWindsorWriteTool(name: string): boolean {
  const normalized = name.trim();
  const lower = normalized.toLowerCase();
  if (lower === "list_actions" || lower === "execute_action") return true;
  if (lower.startsWith("create_")) return true;
  if (lower.includes("execute_action") || lower.includes("list_actions")) {
    return true;
  }
  return false;
}

export function assertWindsorToolAllowed(
  name: string,
  writeActionsToggle: WindsorWriteActionsToggle = WINDSOR_WRITE_ACTIONS_TOGGLE,
): WindsorAllowedTool {
  const trimmed = name.trim();
  if (!(WINDSOR_ALLOWED_TOOLS as readonly string[]).includes(trimmed)) {
    throw new Error(
      `Windsor tool '${trimmed}' is not on the named allowlist (deny-by-default)`,
    );
  }
  if (isWindsorWriteTool(trimmed) && writeActionsToggle !== "ON") {
    throw new Error("Windsor write tools are denied");
  }
  return trimmed as WindsorAllowedTool;
}

export function assertWindsorOAuthOnly(auth: WindsorAuth): string {
  if (auth.kind === "api_key") {
    throw new Error("Windsor API keys are forbidden; OAuth only");
  }
  if (auth.kind !== "oauth" || !auth.accessToken.trim()) {
    throw new Error("WINDSOR_OAUTH_REQUIRED");
  }
  return auth.accessToken;
}

export function normalizeAccountId(id: string): string {
  return id.trim().replace(/^act_/i, "");
}

export function isAllowlistedWindsorAccountId(id: string): boolean {
  return WINDSOR_ALLOWED_ACCOUNT_ID_SET.has(id);
}

export function uniqueAllowlistedAccountIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!isAllowlistedWindsorAccountId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function preferredWindsorAccountId(ids: string[]): string {
  return ids.includes(WINDSOR_LOCKED_ACCOUNT_ID)
    ? WINDSOR_LOCKED_ACCOUNT_ID
    : (ids[0] ?? WINDSOR_LOCKED_ACCOUNT_ID);
}

export function lockWindsorAccounts(input: {
  connector?: unknown;
  accounts?: unknown;
}): AccountLockResult {
  if (typeof input.connector !== "string" || !input.connector.trim()) {
    return {
      ok: false,
      hold: true,
      reason: "Missing connector. HOLD.",
    };
  }
  if (input.connector !== WINDSOR_CONNECTOR_ID) {
    return {
      ok: false,
      hold: true,
      reason: `get_data connector must be ${WINDSOR_CONNECTOR_ID}; got ${String(input.connector)}. HOLD.`,
    };
  }
  if (input.accounts == null || input.accounts === "") {
    return {
      ok: false,
      hold: true,
      reason: "empty-all accounts rejected. HOLD.",
    };
  }
  const list = Array.isArray(input.accounts)
    ? input.accounts
    : [input.accounts];
  if (list.length === 0) {
    return {
      ok: false,
      hold: true,
      reason: "empty-all accounts rejected. HOLD.",
    };
  }
  const normalized = list.map((item) =>
    typeof item === "string" ? normalizeAccountId(item) : "",
  );
  if (normalized.some((id) => !id)) {
    return {
      ok: false,
      hold: true,
      reason: "Ambiguous account id. HOLD.",
    };
  }
  const unexpected = normalized.filter(
    (id) => !isAllowlistedWindsorAccountId(id),
  );
  if (unexpected.length > 0) {
    return {
      ok: false,
      hold: true,
      reason: `Non-locked account id(s): ${unexpected.join(",")}. HOLD, do not guess.`,
    };
  }
  const allowlisted = uniqueAllowlistedAccountIds(normalized);
  if (allowlisted.length === 0) {
    return {
      ok: false,
      hold: true,
      reason: "No connected Meta account is available.",
    };
  }
  return { ok: true, accountId: preferredWindsorAccountId(allowlisted) };
}

function extraKeys(
  args: Record<string, unknown>,
  allowed: Set<string>,
): string[] {
  return Object.keys(args).filter((key) => !allowed.has(key));
}

export function inspectWindsorToolArguments(
  toolName: string,
  args: Record<string, unknown> | undefined,
  writeActionsToggle: WindsorWriteActionsToggle = WINDSOR_WRITE_ACTIONS_TOGGLE,
): AccountLockResult | { ok: true; args: Record<string, unknown> } {
  const name = assertWindsorToolAllowed(toolName, writeActionsToggle);
  const raw = args ?? {};
  if (name === "get_current_user") {
    const extras = extraKeys(raw, GET_CURRENT_USER_ARG_KEYS);
    if (extras.length > 0) {
      throw new Error(
        `Unlisted get_current_user argument(s): ${extras.join(",")}`,
      );
    }
    return { ok: true, args: {} };
  }
  if (name === "get_connectors") {
    const extras = extraKeys(raw, GET_CONNECTORS_ARG_KEYS);
    if (extras.length > 0) {
      throw new Error(
        `Unlisted get_connectors argument(s): ${extras.join(",")}`,
      );
    }
    return {
      ok: true,
      args: {
        include_not_yet_connected: raw.include_not_yet_connected === true,
        include_actions:
          writeActionsToggle === "ON" && raw.include_actions === true,
        include_options: raw.include_options === true,
      },
    };
  }
  if (name === "list_actions") {
    const extras = extraKeys(raw, LIST_ACTIONS_ARG_KEYS);
    if (extras.length > 0) {
      throw new Error(`Unlisted ${name} argument(s): ${extras.join(",")}`);
    }
    if (raw.connector !== WINDSOR_CONNECTOR_ID) {
      return lockWindsorAccounts({
        connector: raw.connector,
        accounts: [WINDSOR_LOCKED_ACCOUNT_ID],
      });
    }
    return { ok: true, args: { connector: WINDSOR_CONNECTOR_ID } };
  }
  if (name === "execute_action") {
    const extras = extraKeys(raw, EXECUTE_ACTION_ARG_KEYS);
    if (extras.length > 0) {
      throw new Error(`Unlisted ${name} argument(s): ${extras.join(",")}`);
    }
    if (typeof raw.action !== "string" || !raw.action.trim()) {
      throw new Error("execute_action requires action");
    }
    const locked = lockWindsorAccounts({
      connector: raw.connector,
      accounts: raw.account,
    });
    if (!locked.ok) return locked;
    return {
      ok: true,
      args: {
        connector: WINDSOR_CONNECTOR_ID,
        action: raw.action.trim(),
        account: locked.accountId,
        ...(raw.params &&
        typeof raw.params === "object" &&
        !Array.isArray(raw.params)
          ? { params: raw.params }
          : {}),
      },
    };
  }
  const extras = extraKeys(
    raw,
    name === "get_data"
      ? GET_DATA_ARG_KEYS
      : name === "get_options"
        ? GET_OPTIONS_ARG_KEYS
        : GET_FIELDS_ARG_KEYS,
  );
  if (extras.length > 0) {
    throw new Error(`Unlisted ${name} argument(s): ${extras.join(",")}`);
  }
  const requested = raw.accounts ?? [WINDSOR_LOCKED_ACCOUNT_ID];
  const locked = lockWindsorAccounts({
    connector: raw.connector,
    accounts: requested,
  });
  if (!locked.ok) return locked;
  const accounts = uniqueAllowlistedAccountIds(
    (Array.isArray(requested) ? requested : [requested]).map((item) =>
      typeof item === "string" ? normalizeAccountId(item) : "",
    ),
  );
  if (name === "get_options") {
    return {
      ok: true,
      args: {
        connector: WINDSOR_CONNECTOR_ID,
        accounts,
      },
    };
  }
  if (name === "get_fields") {
    return {
      ok: true,
      args: {
        connector: WINDSOR_CONNECTOR_ID,
        accounts,
        ...(Array.isArray(raw.fields) || typeof raw.fields === "string"
          ? { fields: raw.fields }
          : {}),
      },
    };
  }
  return {
    ok: true,
    args: {
      ...raw,
      connector: WINDSOR_CONNECTOR_ID,
      accounts,
    },
  };
}

function payloadTopLevelKeys(payload: unknown): string {
  if (payload === null) return "null";
  if (Array.isArray(payload)) return "array";
  if (typeof payload !== "object") return typeof payload;
  const keys = Object.keys(payload).sort();
  return keys.length > 0 ? keys.join(",") : "empty-object";
}

function connectorIdentity(item: Record<string, unknown>): string[] {
  return ["id", "name", "slug"]
    .map((key) => item[key])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function looksLikeConnector(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const rec = item as Record<string, unknown>;
  return connectorIdentity(rec).length > 0 || Array.isArray(rec.accounts);
}

function looksLikeConnectorList(
  value: unknown,
  allowEmpty: boolean,
): value is unknown[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return allowEmpty;
  return (
    value.some(looksLikeConnector) &&
    value.every((item) => item == null || looksLikeConnector(item))
  );
}

/** Unwrap common Windsor/FastMCP get_connectors envelopes. Does not invent accounts. */
export function extractConnectorsFromPayload(
  payload: unknown,
): unknown[] | null {
  if (Array.isArray(payload)) {
    return looksLikeConnectorList(payload, true) ? payload : null;
  }
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  if (looksLikeConnectorList(rec.connectors, true)) return rec.connectors;
  if (looksLikeConnectorList(rec.data, true)) return rec.data;

  for (const value of Object.values(rec)) {
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      if (looksLikeConnectorList(value, false)) return value;
      continue;
    }
    const nested = value as Record<string, unknown>;
    if (looksLikeConnectorList(nested.connectors, true))
      return nested.connectors;
    if (looksLikeConnectorList(nested.data, true)) return nested.data;
  }
  return null;
}

function isFacebookConnector(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  return connectorIdentity(item as Record<string, unknown>).includes(
    WINDSOR_CONNECTOR_ID,
  );
}

function readAccountId(account: unknown): string {
  if (typeof account === "string") return normalizeAccountId(account);
  if (!account || typeof account !== "object") return "";
  const id = (account as { id?: unknown }).id;
  if (typeof id === "string") return normalizeAccountId(id);
  if (typeof id === "number" && Number.isSafeInteger(id)) {
    return normalizeAccountId(String(id));
  }
  return "";
}

function readAccountName(account: unknown): string {
  if (!account || typeof account !== "object") return "";
  const name = (account as { name?: unknown }).name;
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

export function inspectFacebookAccountsFromConnectors(
  payload: unknown,
): AccountLockResult {
  const connectors = extractConnectorsFromPayload(payload);
  if (!connectors) {
    return {
      ok: false,
      hold: true,
      reason: `Ambiguous get_connectors payload (keys: ${payloadTopLevelKeys(payload)}). HOLD.`,
    };
  }
  const facebook = connectors.find(isFacebookConnector) as
    | { accounts?: unknown[] }
    | undefined;
  if (!facebook) {
    return {
      ok: false,
      hold: true,
      reason: "facebook connector missing from get_connectors. HOLD.",
    };
  }
  const accounts = Array.isArray(facebook.accounts) ? facebook.accounts : [];
  const ids = accounts.map(readAccountId);
  const unexpected = ids.filter(
    (id) => id && !isAllowlistedWindsorAccountId(id),
  );
  if (unexpected.length > 0) {
    return {
      ok: false,
      hold: true,
      reason: `Windsor returned non-locked account id(s): ${unexpected.join(",")}. HOLD, do not guess.`,
    };
  }
  const allowlisted = uniqueAllowlistedAccountIds(ids);
  if (allowlisted.length === 0) {
    return {
      ok: false,
      hold: true,
      reason: "No connected Meta account is available.",
    };
  }
  const primaryIndex = ids.indexOf(WINDSOR_LOCKED_ACCOUNT_ID);
  if (primaryIndex >= 0) {
    const name = readAccountName(accounts[primaryIndex]);
    if (name && name !== WINDSOR_LOCKED_ACCOUNT_NAME) {
      return {
        ok: false,
        hold: true,
        reason: "Locked account name mismatch (expected mmpl). HOLD.",
      };
    }
  }
  return { ok: true, accountId: preferredWindsorAccountId(allowlisted) };
}

export function requireTrustedPrincipal(
  principal: string | undefined | null,
): string {
  if (typeof principal !== "string" || !principal.trim()) {
    throw new Error("trusted principal_id required before chat/tools");
  }
  if (/^sabro-local-/i.test(principal.trim())) {
    throw new Error("trusted principal_id required before chat/tools");
  }
  return principal.trim();
}

export function isMetaAdsPerformanceQuestion(prompt: string): boolean {
  const text = prompt.toLowerCase();
  return (
    (text.includes("campaign") ||
      text.includes("meta ads") ||
      text.includes("facebook ads")) &&
    (text.includes("worst") ||
      text.includes("perform") ||
      text.includes("spend") ||
      text.includes("last 30") ||
      text.includes("last_30") ||
      text.includes("30 days"))
  );
}

export const PATH_C_FALLBACK_HOLD =
  "PATH C FALLBACK (not MCP PASS): this host has no working same-origin /windsor-mcp proxy. Use Path A on a SABRO TLS host (crm.sabro.cloud Caddy or the Cloudflare Worker). github.io is engineering fallback only — do not stamp MCP PASS.";

/** @deprecated Path C is FALLBACK, not INTERIM. Kept so older copies still match. */
export const PATH_C_INTERIM_HOLD = PATH_C_FALLBACK_HOLD;
