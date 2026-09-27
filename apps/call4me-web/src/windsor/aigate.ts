import {
  AIGATE_MESSAGES_PATH,
  AIGATE_UNAVAILABLE_HOLD,
  BRIDGE_UPSTREAM_ORIGIN,
} from "./aigate-proxy";
import { WINDSOR_ALLOWED_TOOLS, type WindsorAllowedTool } from "./policy";

export const AIGATE_MODEL = "claude-oauth-sonnet";
export const AIGATE_MAX_TOKENS = 2048;

export type AigateTool = {
  name: WindsorAllowedTool;
  description: string;
  input_schema: Record<string, unknown>;
};

export type AigateContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type AigateMessage = {
  role: "user" | "assistant";
  content: string | AigateContentBlock[];
};

export type AigateRequest = {
  model: string;
  max_tokens: number;
  system: string;
  messages: AigateMessage[];
  tools: AigateTool[];
};

export type AigateResponse = {
  stop_reason?: string;
  content: AigateContentBlock[];
};

export type AigateClient = {
  complete(request: AigateRequest): Promise<AigateResponse>;
};

const TOOL_DESCRIPTIONS: Record<WindsorAllowedTool, string> = {
  get_current_user: "Read the Windsor profile (plan only). UNTRUSTED_EXTERNAL.",
  get_connectors:
    "List Windsor connectors. include_actions is forced false. UNTRUSTED_EXTERNAL.",
  get_options:
    "Read Windsor options for an allowlisted facebook account. UNTRUSTED_EXTERNAL.",
  get_fields:
    "Read Windsor field ids for an allowlisted facebook account. UNTRUSTED_EXTERNAL.",
  get_data:
    "Read Meta Ads rows for allowlisted facebook accounts only. UNTRUSTED_EXTERNAL.",
  list_actions:
    "List Windsor write actions for facebook before execute_action. UNTRUSTED_EXTERNAL.",
  execute_action:
    "Execute a Windsor write action on an allowlisted facebook account. Confirm intent first. UNTRUSTED_EXTERNAL.",
};

export function aigateRequestUrl(
  env: { VITE_AIGATE_PROXY?: string } = import.meta.env,
): string {
  const proxy = env.VITE_AIGATE_PROXY;
  if (typeof proxy === "string" && proxy.trim()) {
    if (proxy.trim().toLowerCase() === "direct") {
      return `${BRIDGE_UPSTREAM_ORIGIN}/v1/messages`;
    }
    return proxy.trim();
  }
  return AIGATE_MESSAGES_PATH;
}

export function windsorAigateTools(): AigateTool[] {
  return WINDSOR_ALLOWED_TOOLS.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    input_schema: { type: "object", additionalProperties: true },
  }));
}

export function extractAigateText(content: AigateContentBlock[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function extractAigateToolUses(
  content: AigateContentBlock[],
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  return content
    .filter(
      (
        block,
      ): block is {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      } => block.type === "tool_use",
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      input:
        block.input && typeof block.input === "object" && !Array.isArray(block.input)
          ? block.input
          : {},
    }));
}

export function parseAigateResponse(payload: unknown): AigateResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Aigate returned an empty body");
  }
  const rec = payload as {
    stop_reason?: unknown;
    content?: unknown;
    error?: { message?: unknown } | string;
    text?: unknown;
  };
  if (typeof rec.error === "string" && rec.error.trim()) {
    throw new Error(rec.error.trim());
  }
  if (
    rec.error &&
    typeof rec.error === "object" &&
    typeof rec.error.message === "string"
  ) {
    throw new Error(rec.error.message);
  }
  if (typeof rec.text === "string" && rec.content == null) {
    return { content: [{ type: "text", text: rec.text }] };
  }
  if (!Array.isArray(rec.content)) {
    throw new Error("Aigate response missing content");
  }
  const content: AigateContentBlock[] = [];
  for (const item of rec.content) {
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    if (block.type === "text" && typeof block.text === "string") {
      content.push({ type: "text", text: block.text });
      continue;
    }
    if (
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string"
    ) {
      content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input:
          block.input &&
          typeof block.input === "object" &&
          !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {},
      });
    }
  }
  return {
    stop_reason: typeof rec.stop_reason === "string" ? rec.stop_reason : undefined,
    content,
  };
}

export function createAigateHttpClient(input: {
  fetchImpl?: typeof fetch;
  messagesUrl?: string;
} = {}): AigateClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const messagesUrl = input.messagesUrl ?? aigateRequestUrl();
  return {
    async complete(request) {
      let response: Response;
      try {
        response = await fetchImpl(messagesUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(request),
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`${AIGATE_UNAVAILABLE_HOLD} (${error.message})`);
        }
        throw new Error(AIGATE_UNAVAILABLE_HOLD);
      }
      const text = await response.text();
      if (!response.ok) {
        if (
          response.status === 404 ||
          response.status === 405 ||
          response.status === 502 ||
          response.status === 503
        ) {
          throw new Error(`${AIGATE_UNAVAILABLE_HOLD} (status ${response.status})`);
        }
        throw new Error(
          text.trim()
            ? `Aigate request failed with status ${response.status}: ${text.trim().slice(0, 240)}`
            : `Aigate request failed with status ${response.status}`,
        );
      }
      return parseAigateResponse(text ? (JSON.parse(text) as unknown) : null);
    },
  };
}
