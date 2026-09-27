import { describe, expect, it } from "vitest";
import {
  CALL4ME_EMBED_SRC,
  CALL4ME_VIEW_QUERY,
  CRM_EMBED_SRC,
  canSeeCall4MeNav,
  canSeeCrmNav,
  crmNavIdentityFromSession,
  isFounderOwnerInvite,
  isHarishCrmInvite,
  SHELL_RAIL_LABEL,
  shellViewFromSearch,
  TWENTY_CRM_EMBED_RESIDUAL,
} from "./crm-nav";
import railSource from "./ShellRail.tsx?raw";
import source from "./WindsorApp.tsx?raw";

describe("CRM nav hide-until-invite", () => {
  it("shows CRM for Harish invite (email local-part or app_metadata claim)", () => {
    expect(canSeeCrmNav({ email: "harish@example.test" })).toBe(true);
    expect(
      isHarishCrmInvite({
        email: "rahul@example.test",
        appMetadata: { crm_embed: true },
      }),
    ).toBe(true);
    expect(
      canSeeCrmNav({
        email: "rahul@example.test",
        appMetadata: { crm_embed: "harish" },
      }),
    ).toBe(true);
    expect(canSeeCrmNav({ email: "rahul@example.test" })).toBe(false);
    expect(
      canSeeCrmNav({
        email: "rahul@example.test",
        appMetadata: {},
      }),
    ).toBe(false);
  });

  it("shows CRM for founder/owner email or crm_embed founder/owner claim", () => {
    expect(canSeeCrmNav({ email: "sabro@shambhu.net" })).toBe(true);
    expect(isFounderOwnerInvite({ email: "sabro@shambhu.net" })).toBe(true);
    expect(canSeeCrmNav({ email: "sabro@example.test" })).toBe(true);
    expect(
      canSeeCrmNav({
        email: "rahul@example.test",
        appMetadata: { crm_embed: "founder" },
      }),
    ).toBe(true);
    expect(
      canSeeCrmNav({
        email: "rahul@example.test",
        appMetadata: { crm_embed: "owner" },
      }),
    ).toBe(true);
    expect(isFounderOwnerInvite({ email: "rahul@example.test" })).toBe(false);
  });

  it("hides CRM for Rahul without a crm_embed claim", () => {
    expect(canSeeCrmNav({ email: "rahul@ads.test" })).toBe(false);
    expect(
      canSeeCrmNav({
        email: "rahul@example.test",
        appMetadata: { crm_embed: false },
      }),
    ).toBe(false);
  });

  it("ignores forged user_metadata-style claims and only reads app_metadata", () => {
    const fromSession = crmNavIdentityFromSession({
      email: "rahul@example.test",
      session: {
        user: { app_metadata: { crm_embed: true } },
      },
    });
    expect(canSeeCrmNav(fromSession)).toBe(true);
    expect(
      canSeeCrmNav({
        email: "not-harish@example.test",
        appMetadata: { crm_embed: false },
      }),
    ).toBe(false);
  });

  it("keeps ?view=crm on the embed route only when invited", () => {
    expect(shellViewFromSearch("?view=crm", true)).toBe("crm");
    expect(shellViewFromSearch("?view=crm", false)).toBe("chat");
    expect(shellViewFromSearch("", true)).toBe("chat");
  });

  it("embeds invited CRM at crm.sabro.cloud and never mentions VoiceLink", () => {
    expect(TWENTY_CRM_EMBED_RESIDUAL).toContain("Invited CRM workspace");
    expect(TWENTY_CRM_EMBED_RESIDUAL).toContain(
      "Ice workspaces are not MMPL ads accounts",
    );
    expect(CRM_EMBED_SRC).toBe("https://crm.sabro.cloud/");
    expect(source).toContain("canSeeCrmNav");
    expect(source).toContain("TWENTY_CRM_EMBED_RESIDUAL");
    expect(source).toContain("<iframe");
    expect(source).toContain("CRM_EMBED_SRC");
    expect(source).toMatch(/title=["']CRM["']/);
    expect(source).toMatch(/aria-label=["']CRM["']/);
    expect(source).not.toMatch(/VoiceLink|57332/i);
    expect(source).not.toMatch(/Ice === MMPL|Ice=MMPL/i);
  });
});

describe("Call4Me shelf hide-until-invite", () => {
  it("shows Call4Me for founder and Harish, not Rahul without invite", () => {
    expect(canSeeCall4MeNav({ email: "sabro@shambhu.net" })).toBe(true);
    expect(canSeeCall4MeNav({ email: "harish@example.test" })).toBe(true);
    expect(canSeeCall4MeNav({ email: "rahul@example.test" })).toBe(false);
    expect(
      canSeeCall4MeNav({
        email: "rahul@example.test",
        appMetadata: { crm_embed: "founder" },
      }),
    ).toBe(true);
  });

  it("keeps ?view=call4me only when the Call4Me rail item is invited", () => {
    expect(shellViewFromSearch(`?view=${CALL4ME_VIEW_QUERY}`, true, true)).toBe(
      "call4me",
    );
    expect(shellViewFromSearch("?view=call4me", true, false)).toBe("chat");
    expect(shellViewFromSearch("?view=call4me", false, false)).toBe("chat");
  });

  it("embeds same-package Call4Me for invited operators only", () => {
    expect(CALL4ME_EMBED_SRC).toBe("./index.html?embedded=shelf");
    expect(source).toContain("canSeeCall4MeNav");
    expect(source).toContain("CALL4ME_EMBED_SRC");
    expect(source).toMatch(/title=["']Call4Me["']/);
    expect(source).toMatch(/aria-label=["']Call4Me["']/);
    expect(source).not.toMatch(/VoiceLink|57332/i);
  });
});

describe("left-rail shell nav lock", () => {
  it("puts Chat / Call / CRM on the left rail, not top tabs", () => {
    expect(SHELL_RAIL_LABEL).toBe("Shell rail");
    expect(source).toContain("ShellRail");
    expect(source).toContain("showCall4Me");
    expect(source).toContain("showCrm");
    expect(source).toContain("Open navigation");
    expect(source).not.toContain("shell-tabs");
    expect(source).not.toContain("shell-tab");
    expect(railSource).toContain("SHELL_RAIL_LABEL");
    expect(railSource).toContain("shell-rail");
    expect(railSource).toContain("shell-rail-item");
    expect(railSource).toContain("Chat");
    expect(railSource).toMatch(/>\s*Call\s*</);
    expect(railSource).not.toMatch(/>\s*Call4Me\s*</);
    expect(railSource).toContain("CRM");
    expect(source).not.toMatch(
      /aria-label=["']Shell["'][\s\S]*className=["']shell-tabs["']/,
    );
  });

  it("does not unlock Contacts for Rahul Chat+Windsor", () => {
    expect(canSeeCall4MeNav({ email: "rahul@example.test" })).toBe(false);
    expect(canSeeCall4MeNav({ email: "rahul@ads.test" })).toBe(false);
    expect(source).not.toMatch(/Contacts/);
    expect(railSource).not.toMatch(/Contacts/);
    expect(source).not.toMatch(/VoiceLink|57332/i);
  });
});
