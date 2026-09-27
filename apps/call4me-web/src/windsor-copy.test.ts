import source from "./WindsorApp.tsx?raw";
import { sabroChatLoginHelper, sabroChatPolicyBanner } from "./windsor/chat";
import oauthSource from "./windsor/oauth.ts?raw";
import policySource from "./windsor/policy.ts?raw";
import callbackSource from "./windsor-callback-main.ts?raw";

describe("CR-WINDSOR-MCP-WEB-001 Identity-gated surface", () => {
  it("requires SABRO Identity and never offers an API key field", () => {
    const compact = source.replace(/\s+/g, " ");
    expect(source).toContain("SABRO IDENTITY");
    expect(source).toContain("Sign in to Windsor");
    expect(source).toContain("Connect Windsor");
    expect(source).toContain('getWindsorAuth().kind === "oauth"');
    expect(compact).toContain("These buttons are for setup checks");
    expect(source).toContain("Worst Meta campaign (30d)");
    expect(source).toContain("handleWebChat");
    expect(source).toContain("Message SABRO");
    expect(source).toContain("showWindsorProveUi");
    expect(source).toContain("sabroChatPolicyBanner");
    expect(source).toContain("connected Meta accounts");
    expect(source).toContain("canSeeCrmNav");
    expect(source).toContain("canSeeCall4MeNav");
    expect(source).toContain("CRM");
    expect(source).toContain("Call4Me");
    expect(source).toContain("ShellRail");
    expect(source).not.toContain("shell-tabs");
    expect(source).toContain("<iframe");
    expect(source).toContain("CRM_EMBED_SRC");
    expect(source).toContain("CALL4ME_EMBED_SRC");
    expect(source).not.toMatch(/type=["']password["']|name=["']api[_-]?key/i);
    expect(source).not.toMatch(/VoiceLink|57332/i);
    expect(source).not.toMatch(
      /bridge \/ aigate|Windsor MCP|OAuth PKCE|same-origin \/windsor-mcp/i,
    );
    expect(source).not.toMatch(
      /"OTP"|'OTP'|OTP —|not L0|WebRTC|IdentityGate|Invisible|Verto|DISA/,
    );
    expect(sabroChatLoginHelper()).toContain("own invite");
    expect(sabroChatPolicyBanner("ON")).toContain("connected Meta accounts");
    expect(sabroChatPolicyBanner("ON")).toContain(
      "Ice workspaces are not MMPL ads accounts",
    );
    expect(sabroChatPolicyBanner("ON")).not.toMatch(
      /bridge|aigate|MCP|PKCE|write-actions|allowlist/i,
    );
  });

  it("keeps OAuth PKCE against mcp.windsor.ai with write-actions ON", () => {
    expect(oauthSource).toContain("https://mcp.windsor.ai/authorize");
    expect(oauthSource).toContain("code_challenge_method");
    expect(oauthSource).toContain("S256");
    expect(oauthSource).toContain(
      'WINDSOR_OAUTH_SCOPES = "offline_access create delete"',
    );
    expect(policySource).toContain("export const WINDSOR_WRITE_ACTIONS_TOGGLE");
    expect(policySource).toMatch(
      /WINDSOR_WRITE_ACTIONS_TOGGLE: WindsorWriteActionsToggle = "ON"/,
    );
    expect(policySource).toContain("get_current_user");
    expect(policySource).toContain("list_actions");
    expect(policySource).toContain("1401505225224082");
    expect(policySource).toContain("272592740320720");
    expect(source).toContain("connected Meta accounts");
    expect(source).not.toMatch(/Allowlisted accounts|4192435737656223/);
    expect(source).not.toMatch(/VoiceLink|57332/i);
    expect(callbackSource).toContain("completeWindsorOAuthCallback");
  });
});
