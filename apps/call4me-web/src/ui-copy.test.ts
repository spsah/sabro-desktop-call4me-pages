import source from "./App.tsx?raw";
import crmLoginSource from "./CrmLogin.tsx?raw";
import windsorSource from "./WindsorApp.tsx?raw";
import { sabroChatLoginHelper, sabroChatPolicyBanner } from "./windsor/chat";

describe("Identity-only calling UI", () => {
  it("has no second-login controls or infrastructure copy", () => {
    expect(source).not.toMatch(
      /Calling credentials|Connect calling|Domain \(optional\)|wss:\/\//i,
    );
  });

  it("uses plain-language deal and availability copy", () => {
    expect(source).toContain("Deal ID");
    expect(source).toContain("Calling isn’t available — try again.");
  });

  it("defaults shelf and standalone to unbound calling without a paste field", () => {
    expect(source).toContain("allowUnboundOpportunity = true");
    expect(source).toContain("showDealIdField(");
    expect(source).toContain("This call will be saved to this deal.");
    expect(source).toContain('embeddedParam === "twenty"');
    expect(source).toContain('embeddedParam === "shelf"');
  });

  it("uses Communicator labels on the Call4Me surface with no tel: path", () => {
    expect(source).toContain("Active deals");
    expect(source).toContain("Contacts");
    expect(source).toContain('Today{"\'"}s calls');
    expect(source).not.toContain("Phone book");
    expect(source).not.toContain("Next Activities");
    expect(source).toContain("No calls today.");
    expect(source).toContain("Tap a contact to call");
    expect(source).toContain("+ Add");
    expect(source).toContain("Import");
    expect(source).toContain("Export");
    expect(source).toContain("Edit");
    expect(source).toContain("Delete");
    expect(source).toContain("Save");
    expect(source).toContain("Confirm");
    expect(source).toContain("Microphone");
    expect(source).toContain("Speaker");
    expect(source).toContain("Phone access");
    expect(source).toContain("normalizeDialDestination");
    expect(source).toContain("createSupabaseContactStore");
    expect(source).toContain("filterContacts");
    expect(source).toContain("exportContactsCsv");
    expect(source).not.toMatch(/href=\{?[`'"]tel:/);
    expect(source).not.toMatch(
      /window\.open|location\.assign|target=["']_blank["']/,
    );
    expect(source).not.toMatch(
      /WebRTC|\bDISA\b|VoiceLink|57332|Sipcentric|Odoo/i,
    );
    expect(source).not.toMatch(/CSV import|spreadsheet jargon/i);
  });
});

describe("SABRO CRM Identity gate", () => {
  it("presents SABRO Identity as the only CRM door", () => {
    expect(crmLoginSource).toContain("SABRO IDENTITY");
    expect(crmLoginSource).toContain("No separate CRM password is needed.");
    expect(crmLoginSource).not.toMatch(
      /Verto|WSS|SIP|Domain \(optional\)|Connect calling/i,
    );
  });

  it("exchanges only a trusted bearer session through the same-origin bridge", () => {
    expect(crmLoginSource).toContain('fetch("/sabro-auth/session"');
    expect(crmLoginSource).toContain("identity.session.access_token");
    expect(crmLoginSource).toContain('window.location.replace("/")');
  });
});

describe("SABRO shell chat copy", () => {
  it("uses plain product language and never names infrastructure", () => {
    expect(windsorSource).toContain("sabroChatPolicyBanner");
    expect(windsorSource).toContain("connected Meta accounts");
    expect(windsorSource).not.toMatch(
      /WebRTC|IdentityGate|Invisible|"OTP"|'OTP'|OTP —|Verto|DISA/,
    );
    expect(windsorSource).not.toMatch(
      /bridge \/ aigate|Windsor MCP|OAuth PKCE|same-origin \/windsor-mcp/i,
    );
    expect(windsorSource).not.toMatch(
      /write-actions|Allowlisted accounts|ChatGPT\/Claude\/Grok/i,
    );
    expect(sabroChatLoginHelper()).not.toMatch(/OTP|L0|bridge|aigate|MCP/i);
    expect(sabroChatPolicyBanner("ON")).toContain(
      "Ice workspaces are not MMPL ads accounts",
    );
    expect(sabroChatPolicyBanner("ON")).not.toMatch(
      /4192435737656223|1401505225224082|272592740320720/,
    );
  });
});
