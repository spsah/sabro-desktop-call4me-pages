/** CRM Open Call / call-from-deal handoff. Named tab + keypad landing, not Phone book. */

export const CALL4ME_WINDOW_NAME = "sabro-call4me";
/** Named reuse needs rel=opener. Blocking the opener relationship farms tabs. */
export const CALL4ME_WINDOW_REL = "opener";
export const CALL4ME_PANEL_KEYPAD = "keypad";
export const CALL4ME_CHANNEL_NAME = "sabro-call4me";
export const CALL4ME_ALIVE_KEY = "sabro.call4me.alive";
export const CALL4ME_INTENT_KEY = "sabro.call4me.intent";
export const CALL4ME_ALIVE_MS = 4_000;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PHONE_FIELD_KEYS = [
  "phone",
  "telephone",
  "mobile",
  "destination",
] as const;
const RELATED_RECORD_KEYS = [
  "pointOfContact",
  "person",
  "company",
  "contact",
] as const;

export type CrmOpenCallSearch = {
  embeddedParam?: string | null;
  embeddedProp?: boolean;
  opportunityId?: string | null;
  destination?: string | null;
  panel?: string | null;
};

export type BuildCrmCall4MeUrlInput = {
  opportunityId: string;
  destination?: string;
  origin?: string;
  /** Unique per Open Call click so reuse can auto-dial the same dest again. */
  t?: string;
};

export type Call4MeAnchorAttrs = {
  href: string;
  target: typeof CALL4ME_WINDOW_NAME;
  rel: typeof CALL4ME_WINDOW_REL;
};

/** Duck-typed <a>. Twenty FC sandbox has no HTML*Element constructors. */
export type OpenCallAnchor = {
  click: () => void;
  getAttribute: (qualifiedName: string) => string | null;
  setAttribute: (qualifiedName: string, value: string) => void;
  target?: string;
  rel?: string;
};

export type OpenCallAnchorClick = (anchor: OpenCallAnchor) => void;

export type Call4MeIntent = {
  destination?: string;
  opportunityId?: string;
  panel?: string;
  /** Per-click dial request id (hash `t`). New id → auto-dial, even same dest. */
  t?: string;
  at?: number;
};

export type Call4MeLocation = Pick<Location, "search" | "hash">;

type IntentStorage = Pick<Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasDialableDigits(value: string): boolean {
  return value.replace(/\D/g, "").length >= 3;
}

export function destinationFromSearch(
  search: URLSearchParams | CrmOpenCallSearch,
): string {
  if (search instanceof URLSearchParams) {
    for (const key of ["destination", "phone", "number"] as const) {
      const value = search.get(key)?.trim() ?? "";
      if (value) return value;
    }
    return "";
  }
  return search.destination?.trim() ?? "";
}

/**
 * CRM Open Call must land on keypad/dialer even when Communicator Phase 1
 * defaults standalone/shelf to Phone book / Contacts (`panel=phonebook`).
 */
export function isCrmKeypadEntry(input: CrmOpenCallSearch): boolean {
  const panel = input.panel?.trim().toLowerCase() ?? "";
  if (panel === "keypad" || panel === "dialer") return true;
  if (input.embeddedParam === "twenty") return true;
  if (destinationFromSearch(input)) return true;
  if (input.embeddedParam === "shelf") return false;
  const opportunityId = input.opportunityId?.trim() ?? "";
  return Boolean(input.embeddedProp && opportunityId);
}

export function buildCrmCall4MeUrl(input: BuildCrmCall4MeUrlInput): string {
  const params = new URLSearchParams();
  params.set("embedded", "twenty");
  params.set("panel", CALL4ME_PANEL_KEYPAD);
  const hash = new URLSearchParams();
  hash.set("opportunityId", input.opportunityId);
  const destination = input.destination?.trim();
  if (destination) hash.set("destination", destination);
  const t = input.t?.trim();
  if (t) hash.set("t", t);
  const path = `/call4me/?${params.toString()}#${hash.toString()}`;
  if (!input.origin) return path;
  return `${input.origin.replace(/\/$/, "")}${path}`;
}

export function createCall4MeDialRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

export function call4MeIntentSignature(intent: Call4MeIntent): string {
  const t = intent.t?.trim();
  if (t) return `t:${t}`;
  return `loc:${intent.destination?.trim() ?? ""}|${intent.opportunityId?.trim() ?? ""}|${intent.panel?.trim() ?? ""}`;
}

/** Stamp hash `t` so a named-target reuse is a new fragment even for the same dest. */
export function stampCall4MeDialRequest(
  url: string,
  dialRequestId: string = createCall4MeDialRequestId(),
): string {
  const origin = "https://call4me.local";
  const parsed = new URL(url, origin);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  hash.set("t", dialRequestId);
  parsed.hash = hash.toString();
  if (/^https?:\/\//i.test(url)) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isOpenCallAnchor(value: unknown): value is OpenCallAnchor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    getAttribute?: unknown;
    setAttribute?: unknown;
    tagName?: unknown;
  };
  if (
    typeof candidate.getAttribute !== "function" ||
    typeof candidate.setAttribute !== "function"
  ) {
    return false;
  }
  if (
    typeof candidate.tagName === "string" &&
    candidate.tagName.toUpperCase() !== "A"
  ) {
    return false;
  }
  return true;
}

/** Stamp hash `t` on a named-target <a> without HTML*Element globals. */
export function stampOpenCallAnchorHref(
  target: unknown,
  dialRequestId: string,
): void {
  if (!isOpenCallAnchor(target)) return;
  const href = target.getAttribute("href");
  if (!href) return;
  target.setAttribute("href", stampCall4MeDialRequest(href, dialRequestId));
}

export function parseCall4MeLocation(location: Call4MeLocation): {
  destination: string;
  opportunityId: string;
  panel: string;
  embeddedParam: string;
  t: string;
} {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const pick = (key: string) =>
    hash.get(key)?.trim() || search.get(key)?.trim() || "";
  return {
    destination: destinationFromSearch(hash) || destinationFromSearch(search),
    opportunityId: pick("opportunityId"),
    panel: pick("panel"),
    embeddedParam: pick("embedded"),
    t: pick("t"),
  };
}

export function intentFromCall4MeUrl(url: string): Call4MeIntent {
  const parsed = new URL(url, "https://call4me.local");
  return parseCall4MeLocation({
    search: parsed.search,
    hash: parsed.hash,
  });
}

export function call4MeAnchorAttrs(url: string): Call4MeAnchorAttrs {
  return {
    href: url,
    target: CALL4ME_WINDOW_NAME,
    rel: CALL4ME_WINDOW_REL,
  };
}

export function isCall4MeSurfaceAlive(
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
  now = Date.now(),
): boolean {
  if (!storage) return false;
  const ts = Number(storage.getItem(CALL4ME_ALIVE_KEY) ?? "");
  return Number.isFinite(ts) && now - ts >= 0 && now - ts < CALL4ME_ALIVE_MS;
}

export function markCall4MeSurfaceAlive(
  storage: Pick<Storage, "setItem"> | null = defaultStorage(),
  now = Date.now(),
): void {
  try {
    storage?.setItem(CALL4ME_ALIVE_KEY, String(now));
  } catch {
    // private mode / sandbox
  }
  claimCall4MeWindowName();
}

export function claimCall4MeWindowName(
  target: { name: string } | null = typeof window === "undefined"
    ? null
    : window,
): void {
  if (!target) return;
  try {
    target.name = CALL4ME_WINDOW_NAME;
  } catch {
    // ignore
  }
}

export function readPublishedCall4MeIntent(
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): Call4MeIntent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CALL4ME_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Call4MeIntent;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function publishCall4MeIntent(
  intent: Call4MeIntent,
  options: {
    storage?: Pick<Storage, "setItem"> | null;
    postMessage?: (data: Call4MeIntent) => void;
  } = {},
): Call4MeIntent {
  const payload: Call4MeIntent = {
    destination: intent.destination?.trim() ?? "",
    opportunityId: intent.opportunityId?.trim() ?? "",
    panel: intent.panel?.trim() || CALL4ME_PANEL_KEYPAD,
    t: intent.t?.trim() || createCall4MeDialRequestId(),
  };
  try {
    (options.storage ?? defaultStorage())?.setItem(
      CALL4ME_INTENT_KEY,
      JSON.stringify({ ...payload, at: Date.now() }),
    );
  } catch {
    // ignore
  }
  if (options.postMessage) {
    options.postMessage(payload);
    return payload;
  }
  postCall4MeChannel(payload);
  return payload;
}

export function offerCall4MeIntent(
  intent: Call4MeIntent,
  options: {
    storage?: IntentStorage | null;
    postMessage?: (data: Call4MeIntent) => void;
    now?: number;
  } = {},
): boolean {
  const storage = options.storage ?? defaultStorage();
  publishCall4MeIntent(intent, {
    storage,
    postMessage: options.postMessage,
  });
  return isCall4MeSurfaceAlive(storage, options.now);
}

export function handleOpenCallClick(
  event: {
    preventDefault: () => void;
    currentTarget?: unknown;
  },
  intent: Call4MeIntent,
  options?: {
    storage?: IntentStorage | null;
    postMessage?: (data: Call4MeIntent) => void;
    now?: number;
  },
): boolean {
  const t = intent.t?.trim() || createCall4MeDialRequestId();
  const stamped: Call4MeIntent = { ...intent, t };
  stampOpenCallAnchorHref(event.currentTarget, t);
  // Never preventDefault. Twenty FC sandbox cannot BroadcastChannel or share
  // localStorage with Call4Me; named-target <a> + unique hash `t` is the LIVE
  // reuse → auto-dial path. preventDefault-when-alive is why PR36 missed L0.
  return offerCall4MeIntent(stamped, options);
}

/** Named-target <a> navigation. Twenty FrontComponent stubs Window.open. */
export function openCall4MeTab(
  url: string,
  click: OpenCallAnchorClick = (anchor) => anchor.click(),
  doc: Document = document,
  options: {
    intent?: Call4MeIntent;
    storage?: IntentStorage | null;
    postMessage?: (data: Call4MeIntent) => void;
  } = {},
): OpenCallAnchor {
  const t =
    options.intent?.t?.trim() ||
    intentFromCall4MeUrl(url).t ||
    createCall4MeDialRequestId();
  const stampedUrl = stampCall4MeDialRequest(url, t);
  const a = doc.createElement("a");
  const attrs = call4MeAnchorAttrs(stampedUrl);
  a.setAttribute("href", attrs.href);
  a.setAttribute("target", attrs.target);
  a.setAttribute("rel", attrs.rel);
  offerCall4MeIntent(
    { ...(options.intent ?? intentFromCall4MeUrl(stampedUrl)), t },
    {
      storage: options.storage,
      postMessage: options.postMessage,
    },
  );
  click(a);
  return a;
}

export function subscribeCall4MeIntent(
  onIntent: (intent: Call4MeIntent) => void,
  target: Pick<
    Window,
    "addEventListener" | "removeEventListener"
  > | null = typeof window === "undefined" ? null : window,
): () => void {
  if (!target) return () => undefined;
  const initial = parseCall4MeLocation(window.location);
  const seenT = new Set<string>();
  let lastApplied = call4MeIntentSignature(initial);
  if (initial.t) seenT.add(initial.t);
  const deliver = (intent: Call4MeIntent) => {
    const signature = call4MeIntentSignature(intent);
    if (signature === lastApplied) return;
    const t = intent.t?.trim();
    if (t && seenT.has(t)) return;
    lastApplied = signature;
    if (t) seenT.add(t);
    onIntent(intent);
  };
  const inspectLocationAndStore = () => {
    const fromLocation = parseCall4MeLocation(window.location);
    if (fromLocation.t || fromLocation.destination) {
      const before = lastApplied;
      deliver(fromLocation);
      if (fromLocation.t && lastApplied !== before) return;
      if (
        fromLocation.t &&
        call4MeIntentSignature(fromLocation) === lastApplied
      ) {
        return;
      }
    }
    const stored = readPublishedCall4MeIntent();
    if (stored?.t?.trim() || stored?.destination?.trim()) {
      deliver(stored);
    }
  };
  const handleHash = () => deliver(parseCall4MeLocation(window.location));
  const handleStorage = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key !== CALL4ME_INTENT_KEY || !storageEvent.newValue)
      return;
    try {
      deliver(JSON.parse(storageEvent.newValue) as Call4MeIntent);
    } catch {
      // ignore
    }
  };
  const handleVisibility = () => {
    if (document.visibilityState === "visible") inspectLocationAndStore();
  };
  target.addEventListener("hashchange", handleHash);
  target.addEventListener("popstate", inspectLocationAndStore);
  target.addEventListener("focus", inspectLocationAndStore);
  target.addEventListener("pageshow", inspectLocationAndStore);
  target.addEventListener("storage", handleStorage);
  document.addEventListener("visibilitychange", handleVisibility);
  const channel = openCall4MeChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent<Call4MeIntent>) => {
      if (event.data && typeof event.data === "object") deliver(event.data);
    };
  }
  return () => {
    target.removeEventListener("hashchange", handleHash);
    target.removeEventListener("popstate", inspectLocationAndStore);
    target.removeEventListener("focus", inspectLocationAndStore);
    target.removeEventListener("pageshow", inspectLocationAndStore);
    target.removeEventListener("storage", handleStorage);
    document.removeEventListener("visibilitychange", handleVisibility);
    channel?.close();
  };
}

function defaultStorage(): IntentStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function openCall4MeChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CALL4ME_CHANNEL_NAME);
  } catch {
    return null;
  }
}

let publishChannel: BroadcastChannel | null | undefined;

function postCall4MeChannel(intent: Call4MeIntent): void {
  if (publishChannel === undefined) {
    publishChannel = openCall4MeChannel();
  }
  try {
    publishChannel?.postMessage(intent);
  } catch {
    publishChannel = openCall4MeChannel();
    try {
      publishChannel?.postMessage(intent);
    } catch {
      // private mode / sandbox
    }
  }
}

function composePhone(callingCode: string | undefined, number: string): string {
  const n = number.trim();
  if (!n) return "";
  if (n.startsWith("+")) return n;
  const cc = (callingCode ?? "").trim();
  if (!cc) return n;
  const code = cc.startsWith("+") ? cc : `+${cc}`;
  return `${code}${n.replace(/^0/, "")}`;
}

function phoneFromPhonesMetadata(
  value: Record<string, unknown>,
): string | undefined {
  if (
    typeof value.primaryPhoneNumber === "string" &&
    value.primaryPhoneNumber.trim()
  ) {
    return composePhone(
      typeof value.primaryPhoneCallingCode === "string"
        ? value.primaryPhoneCallingCode
        : undefined,
      value.primaryPhoneNumber,
    );
  }
  if (!Array.isArray(value.additionalPhones)) return undefined;
  for (const extra of value.additionalPhones) {
    if (!isRecord(extra)) continue;
    const number =
      typeof extra.number === "string"
        ? extra.number
        : typeof extra.primaryPhoneNumber === "string"
          ? extra.primaryPhoneNumber
          : "";
    if (!hasDialableDigits(number)) continue;
    return composePhone(
      typeof extra.callingCode === "string" ? extra.callingCode : undefined,
      number,
    );
  }
  return undefined;
}

function phoneFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && hasDialableDigits(value))
    return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    const asString = String(value);
    if (hasDialableDigits(asString)) return asString;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = phoneFromUnknown(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  return phoneFromPhonesMetadata(value);
}

export function destinationFromOpportunityRecord(
  record: unknown,
): string | undefined {
  if (!isRecord(record)) return undefined;
  for (const key of PHONE_FIELD_KEYS) {
    const found = phoneFromUnknown(record[key]);
    if (found) return found;
  }
  const fromPhones = phoneFromUnknown(record.phones);
  if (fromPhones) return fromPhones;
  for (const key of RELATED_RECORD_KEYS) {
    const nested = destinationFromOpportunityRecord(record[key]);
    if (nested) return nested;
  }
  return undefined;
}

function recordIdOf(value: unknown): string | undefined {
  if (typeof value === "string" && UUID.test(value.trim())) return value.trim();
  if (isRecord(value) && typeof value.id === "string" && UUID.test(value.id)) {
    return value.id;
  }
  return undefined;
}

function unwrapNamedRecord(
  payload: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(payload)) return undefined;
  if (isRecord(payload[key])) return payload[key];
  if (isRecord(payload.data)) {
    const data = payload.data;
    if (isRecord(data[key])) return data[key];
    if (typeof data.id === "string") return data;
  }
  if (typeof payload.id === "string") return payload;
  return undefined;
}

async function getJsonRecord(
  fetcher: typeof fetch,
  path: string,
  key: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetcher(path, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    return unwrapNamedRecord(await response.json(), key);
  } catch {
    return undefined;
  }
}

export async function fetchOpportunityDestination(
  opportunityId: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  const id = opportunityId.trim();
  if (!UUID.test(id)) return undefined;
  const opportunity = await getJsonRecord(
    fetcher,
    `/rest/opportunities/${encodeURIComponent(id)}?depth=1`,
    "opportunity",
  );
  if (!opportunity) return undefined;
  const direct = destinationFromOpportunityRecord(opportunity);
  if (direct) return direct;

  const personId = recordIdOf(
    opportunity.pointOfContactId ?? opportunity.pointOfContact,
  );
  if (personId) {
    const person = await getJsonRecord(
      fetcher,
      `/rest/people/${encodeURIComponent(personId)}?depth=1`,
      "person",
    );
    const fromPerson = destinationFromOpportunityRecord(person);
    if (fromPerson) return fromPerson;
  }

  const companyId = recordIdOf(opportunity.companyId ?? opportunity.company);
  if (!companyId) return undefined;
  const company = await getJsonRecord(
    fetcher,
    `/rest/companies/${encodeURIComponent(companyId)}?depth=1`,
    "company",
  );
  return destinationFromOpportunityRecord(company);
}
