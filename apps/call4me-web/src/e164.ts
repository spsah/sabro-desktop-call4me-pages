/** Shared Call4Me E.164 normalize. Client pad UX + broker dial-plan (SoR before trunk). */

export type HomeCountry = "GB" | "IN";
export const DEFAULT_HOME_COUNTRY: HomeCountry = "GB";

const CALLING_CODE: Record<HomeCountry, string> = {
  GB: "44",
  IN: "91",
};

/** Longest-first if shorter codes are added later. */
const KNOWN_CALLING_CODES = ["91", "44"] as const;

export function parseHomeCountry(raw: unknown): HomeCountry {
  if (typeof raw !== "string") return DEFAULT_HOME_COUNTRY;
  const value = raw.trim().toUpperCase();
  if (value === "IN") return "IN";
  if (value === "GB" || value === "UK") return "GB";
  return DEFAULT_HOME_COUNTRY;
}

function isPlausibleNsn(cc: string, nsn: string): boolean {
  if (cc === "44") return nsn.length >= 9 && nsn.length <= 10;
  if (cc === "91") return nsn.length === 10;
  return nsn.length >= 8 && nsn.length <= 12;
}

function extractDigits(raw: string | number): {
  explicitIntl: boolean;
  digits: string;
} {
  let value = String(raw ?? "")
    .trim()
    .normalize("NFKC");
  if (/^tel:/i.test(value)) value = value.slice(4);
  const compact = value.replace(/[\s().-]/g, "");
  const explicitIntl = compact.startsWith("+") || compact.startsWith("00");
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return { explicitIntl, digits };
}

function stripTrunkAfterCc(digits: string): string {
  for (const cc of KNOWN_CALLING_CODES) {
    if (!digits.startsWith(cc)) continue;
    const rest = digits.slice(cc.length);
    if (rest.startsWith("0") && isPlausibleNsn(cc, rest.slice(1))) {
      return `${cc}${rest.slice(1)}`;
    }
  }
  return digits;
}

function matchKnownCc(digits: string): string | null {
  for (const cc of KNOWN_CALLING_CODES) {
    if (!digits.startsWith(cc)) continue;
    let nsn = digits.slice(cc.length);
    if (nsn.startsWith("0") && isPlausibleNsn(cc, nsn.slice(1))) {
      nsn = nsn.slice(1);
    }
    if (isPlausibleNsn(cc, nsn)) return `+${cc}${nsn}`;
  }
  return null;
}

function isHomeNationalNsn(digits: string, home: HomeCountry): boolean {
  if (home === "GB") {
    if (digits.length === 10 && /^[123578]/.test(digits)) return true;
    if (digits.length === 9 && digits.startsWith("800")) return true;
    return false;
  }
  return digits.length === 10 && /^[6-9]/.test(digits);
}

export function normalizeToE164(
  raw: string | number,
  homeCountry: HomeCountry = DEFAULT_HOME_COUNTRY,
): string {
  const home = parseHomeCountry(homeCountry);
  const cc = CALLING_CODE[home];
  const { explicitIntl, digits } = extractDigits(raw);
  if (!digits) return "";

  if (explicitIntl) return `+${stripTrunkAfterCc(digits)}`;

  const known = matchKnownCc(digits);
  if (known) return known;

  if (digits.startsWith("0") && digits.length >= 10) {
    return `+${cc}${digits.slice(1)}`;
  }

  if (isHomeNationalNsn(digits, home)) return `+${cc}${digits}`;
  return digits;
}

/** Shared keypad + contacts egress. Client does not own trunk format; broker rewrites too. */
export function normalizeDialDestination(
  raw: string | number,
  homeCountry: HomeCountry = DEFAULT_HOME_COUNTRY,
): string {
  return normalizeToE164(raw, homeCountry);
}

/**
 * Verto/FS destination_number. Live siptrunk.ai matched pre-#32 UK national
 * `0…` digits. A leading `+` on E.164 makes invite dead (L0 16 Sep 2026).
 */
export function formatVertoDestination(
  raw: string | number,
  homeCountry: HomeCountry = DEFAULT_HOME_COUNTRY,
): string {
  const e164 = normalizeToE164(raw, homeCountry);
  if (!e164) return "";
  if (!e164.startsWith("+")) return e164;
  const digits = e164.slice(1);
  if (digits.startsWith("44") && isPlausibleNsn("44", digits.slice(2))) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

/** Home-country pad fill. GB keeps trunk-0 UX; egress still uses normalizeToE164. */
export function formatKeypadDisplay(
  raw: string | number,
  homeCountry: HomeCountry = DEFAULT_HOME_COUNTRY,
): string {
  const home = parseHomeCountry(homeCountry);
  const e164 = normalizeToE164(raw, home);
  if (!e164.startsWith("+")) return e164;
  const prefix = `+${CALLING_CODE[home]}`;
  if (!e164.startsWith(prefix)) return e164;
  const nsn = e164.slice(prefix.length);
  return home === "GB" ? `0${nsn}` : nsn;
}

export type VertoInviteLike = {
  method?: string;
  params?: {
    dialogParams?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function rewriteVertoInviteDestination<T extends VertoInviteLike>(
  message: T,
  homeCountry: HomeCountry = DEFAULT_HOME_COUNTRY,
): T {
  if (message.method !== "verto.invite") return message;
  const dialog = { ...(message.params?.dialogParams ?? {}) };
  const dest = dialog.destination_number;
  if (typeof dest !== "string" && typeof dest !== "number") return message;
  const fsDest = formatVertoDestination(dest, homeCountry);
  dialog.destination_number = fsDest;
  if (
    typeof dialog.remote_caller_id_number === "string" ||
    typeof dialog.remote_caller_id_number === "number"
  ) {
    dialog.remote_caller_id_number = fsDest;
  }
  return {
    ...message,
    params: {
      ...(message.params ?? {}),
      dialogParams: dialog,
    },
  };
}
