/** Desktop/web shelf nav gates. CRM and Call4Me stay hidden until an Identity invite. */

export const CRM_VIEW_QUERY = "crm";
export const CALL4ME_VIEW_QUERY = "call4me";
export const CRM_EMBED_CLAIM = "crm_embed";
export const SHELL_RAIL_LABEL = "Shell rail";

/** Fixed HTTPS CRM origin. Never interpolate search, hash, or user input. */
export const CRM_EMBED_SRC = "https://crm.sabro.cloud/";

/** Same-package Call4Me entry. Worker `/` is Windsor; `/index.html` stays the dialer. */
export const CALL4ME_EMBED_SRC = "./index.html?embedded=shelf";

export const TWENTY_CRM_EMBED_RESIDUAL =
  "Invited CRM workspace. Ice workspaces are not MMPL ads accounts.";

export type CrmNavIdentity = {
  email?: string | null;
  appMetadata?: Record<string, unknown> | null;
};

export type ShellView = "chat" | "crm" | "call4me";

function emailLocalPart(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase().split("@")[0] ?? "";
}

function normalizedEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function hasCrmEmbedInviteClaim(identity: CrmNavIdentity): boolean {
  const claim = identity.appMetadata?.[CRM_EMBED_CLAIM];
  return (
    claim === true ||
    claim === "harish" ||
    claim === "founder" ||
    claim === "owner"
  );
}

/**
 * Harish invite path. Trusted Identity email local-part `harish`, or
 * `app_metadata.crm_embed` stamped by Identity (not user_metadata).
 */
export function isHarishCrmInvite(identity: CrmNavIdentity): boolean {
  if (hasCrmEmbedInviteClaim(identity)) return true;
  return emailLocalPart(identity.email) === "harish";
}

/** Founder/owner path: sabro@shambhu.net or email local-part `sabro`. */
export function isFounderOwnerInvite(identity: CrmNavIdentity): boolean {
  const email = normalizedEmail(identity.email);
  return (
    email === "sabro@shambhu.net" || emailLocalPart(identity.email) === "sabro"
  );
}

/**
 * CRM nav hide-until-invite. Harish path plus founder/owner (sabro@) or
 * `app_metadata.crm_embed` true / "harish" / "founder" / "owner".
 * Rahul (rahul@…) without that claim stays chat-only.
 */
export function canSeeCrmNav(identity: CrmNavIdentity): boolean {
  return isHarishCrmInvite(identity) || isFounderOwnerInvite(identity);
}

/**
 * Call4Me left-rail item. Same invite pattern as CRM (founder sabro@ + Harish, or
 * the Identity crm_embed claim). Rahul is ads chat only — do not infer this
 * from Identity calling access alone. Without the invite, hide Call4Me.
 */
export function canSeeCall4MeNav(identity: CrmNavIdentity): boolean {
  return canSeeCrmNav(identity);
}

export function shellViewFromSearch(
  search: string,
  canSeeCrm: boolean,
  canSeeCall4Me = canSeeCrm,
): ShellView {
  const query = search.includes("?")
    ? search.slice(search.indexOf("?"))
    : search;
  const params = new URLSearchParams(
    query.startsWith("?") ? query : `?${query}`,
  );
  const view = params.get("view");
  if (canSeeCrm && view === CRM_VIEW_QUERY) return "crm";
  if (canSeeCall4Me && view === CALL4ME_VIEW_QUERY) return "call4me";
  return "chat";
}

export function crmNavIdentityFromSession(input: {
  email?: string | null;
  session?: {
    user?: { app_metadata?: Record<string, unknown> | null };
  } | null;
}): CrmNavIdentity {
  return {
    email: input.email,
    appMetadata: input.session?.user?.app_metadata ?? null,
  };
}
