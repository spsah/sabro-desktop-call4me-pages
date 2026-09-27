import type { SupabaseClient } from "@supabase/supabase-js";
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import {
  type AudioDeviceChoice,
  applyOutputDevice,
  listAudioDevices,
  resolveAudioDevice,
} from "./audio-devices";
import {
  addContact,
  type Call4MeContact,
  type ContactStore,
  createSupabaseContactStore,
  deleteContact,
  exportContactsCsv,
  filterContacts,
  hydrateContacts,
  importContacts,
  parseContactFile,
  updateContact,
} from "./contacts";
import {
  type Call4MeIntent,
  createCall4MeDialRequestId,
  destinationFromSearch,
  fetchOpportunityDestination,
  isCrmKeypadEntry,
  markCall4MeSurfaceAlive,
  parseCall4MeLocation,
  subscribeCall4MeIntent,
} from "./crm-open-call";
import { formatKeypadDisplay, normalizeDialDestination } from "./dial";
import {
  acceptIdentitySessionFromUrl,
  createIdentityClient,
  extractTrustedIdentity,
  sendMagicLink,
  type TrustedIdentity,
  verifyEmailOtp,
} from "./identity";
import {
  boundOpportunityId,
  isOpportunityDialable,
  showDealIdField,
} from "./opportunity-binding";
import { type CallEvidence, VertoClient } from "./verto";
import { numberMaskLast4 } from "./number-mask";
import { fetchTenantDeals, type TenantDeal } from "./tenant-deals";

const KEYS = "123456789*0#".split("");
type CallPhase =
  | "idle"
  | "connecting"
  | "ready"
  | "dialing"
  | "connected"
  | "ending";
type CallSurface = "extensions" | "phonebook" | "activities" | "keypad";

type AppPanel =
  | CallSurface
  | "todays-calls"
  | "active-deals"
  | "contacts";

type AppProps = {
  allowUnboundOpportunity?: boolean;
  embedded?: boolean;
  opportunityId?: string;
  contactStore?: ContactStore;
  /** Shell/IA panel; remapped onto CallSurface. */
  panel?: AppPanel;
  /** When true, hide App subnav — shell owns Today's calls / Active deals / Contacts. */
  tenantShell?: boolean;
  /** Tenant flag number_mask_last4; default ON (MMPL). */
  numberMaskLast4?: boolean;
  /** Path-MT client id (tenant shell) for deals fetch. */
  clientId?: string;
  /** Identity bearer for tenant-deals when mounted under shell. */
  accessToken?: string;
};

function resolveSurface(panel: AppPanel | undefined, crmKeypad: boolean): CallSurface {
  if (crmKeypad) return "keypad";
  switch (panel) {
    case "todays-calls":
    case "activities":
      return "activities";
    case "active-deals":
    case "extensions":
      return "extensions";
    case "contacts":
    case "phonebook":
      return "phonebook";
    case "keypad":
      return "keypad";
    default:
      return "phonebook";
  }
}

export default function App({
  allowUnboundOpportunity = true,
  embedded,
  opportunityId: mountedOpportunityId,
  contactStore,
  panel: mountedPanel,
  tenantShell = false,
  numberMaskLast4: maskLast4Flag = true,
  clientId: mountedClientId,
  accessToken: mountedAccessToken,
}: AppProps = {}) {
  const urlParameters = new URLSearchParams(window.location.search);
  const initialIntent = parseCall4MeLocation(window.location);
  const embeddedParam =
    urlParameters.get("embedded") || initialIntent.embeddedParam || null;
  const embeddedSurface = embedded ?? embeddedParam === "twenty";
  const shelfEmbedded = embeddedParam === "shelf";
  const queryDestination = initialIntent.destination;
  const crmKeypadEntry = isCrmKeypadEntry({
    embeddedParam,
    embeddedProp: embedded,
    opportunityId:
      mountedOpportunityId ??
      initialIntent.opportunityId ??
      urlParameters.get("opportunityId"),
    destination: queryDestination,
    panel: initialIntent.panel || urlParameters.get("panel"),
  });
  const [identity, setIdentity] = useState<TrustedIdentity | null>(null);
  const identityRef = useRef<TrustedIdentity | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [destination, setDestination] = useState(() =>
    queryDestination ? formatKeypadDisplay(queryDestination) : "",
  );
  const [opportunityId, setOpportunityId] = useState(
    mountedOpportunityId ??
      initialIntent.opportunityId ??
      urlParameters.get("opportunityId") ??
      "",
  );
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [status, setStatus] = useState("Getting calling ready…");
  const [elapsed, setElapsed] = useState(0);
  const [surface, setSurface] = useState<CallSurface>(() =>
    resolveSurface(mountedPanel, crmKeypadEntry),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Phone access (was Go Online) — register/reachability; control lives in gear only. */
  const [phoneAccess, setPhoneAccess] = useState(true);
  const lastCrmAutoDialIdRef = useRef<string | null>(null);
  const [crmAutoDial, setCrmAutoDial] = useState<{
    id: string;
    destination: string;
  } | null>(() => {
    const dest = initialIntent.destination;
    if (!dest) return null;
    return { id: initialIntent.t || "open", destination: dest };
  });
  const startDialRef = useRef<(number: string) => Promise<void>>(
    async () => undefined,
  );
  const [contacts, setContacts] = useState<Call4MeContact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Call4MeContact | null>(
    null,
  );
  const [draftName, setDraftName] = useState("");
  const [draftTelephone, setDraftTelephone] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [overflowContactId, setOverflowContactId] = useState<string | null>(
    null,
  );
  const [deals, setDeals] = useState<TenantDeal[]>([]);
  const [inputDevices, setInputDevices] = useState<AudioDeviceChoice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceChoice[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState("");
  const [outputDeviceId, setOutputDeviceId] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const vertoRef = useRef<VertoClient | null>(null);
  const contactStoreRef = useRef<ContactStore | null>(contactStore ?? null);
  const inputDeviceIdRef = useRef<string | null>(null);
  const outputDeviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    if (!tenantShell) {
      setDeals([]);
      return;
    }
    const token =
      mountedAccessToken ?? identity?.session.access_token ?? null;
    const clientId = mountedClientId?.trim() ?? "";
    if (!token || !clientId) {
      setDeals([]);
      return;
    }
    let cancelled = false;
    void fetchTenantDeals({ clientId, accessToken: token }).then((rows) => {
      if (!cancelled) setDeals(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantShell, mountedAccessToken, mountedClientId, identity?.session.access_token]);

  useEffect(() => {
    markCall4MeSurfaceAlive();
    const timer = window.setInterval(() => markCall4MeSurfaceAlive(), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const applyIntent = (intent: Call4MeIntent) => {
      const nextDestination = intent.destination?.trim() ?? "";
      const opportunity = intent.opportunityId?.trim() ?? "";
      if (!nextDestination && !opportunity) return;
      if (opportunity) setOpportunityId(opportunity);
      if (nextDestination) {
        setDestination(
          formatKeypadDisplay(
            nextDestination,
            identityRef.current?.homeCountry ?? "GB",
          ),
        );
        setCrmAutoDial({
          id: intent.t?.trim() || createCall4MeDialRequestId(),
          destination: nextDestination,
        });
      }
      setSurface("keypad");
      try {
        window.focus();
      } catch {
        // jsdom and some hosts stub focus
      }
    };
    return subscribeCall4MeIntent(applyIntent);
  }, []);

  useEffect(() => {
    contactStoreRef.current = contactStore ?? contactStoreRef.current;
  }, [contactStore]);

  useEffect(() => {
    inputDeviceIdRef.current = inputDeviceId || null;
  }, [inputDeviceId]);

  useEffect(() => {
    outputDeviceIdRef.current = outputDeviceId || null;
    if (audioRef.current) {
      void applyOutputDevice(audioRef.current, outputDeviceId || null);
    }
  }, [outputDeviceId]);

  useEffect(() => {
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (!publishableKey) {
      setAuthMessage("Identity is not configured for this build.");
      setAuthReady(true);
      return;
    }
    const client = createIdentityClient(publishableKey);
    clientRef.current = client;
    if (!contactStoreRef.current) {
      contactStoreRef.current = createSupabaseContactStore(
        client as unknown as Parameters<typeof createSupabaseContactStore>[0],
      );
    }
    const acceptSession = async (
      session: Parameters<typeof extractTrustedIdentity>[0],
    ) => {
      if (!session) {
        setIdentity(null);
        setAuthReady(true);
        return;
      }
      const trusted = extractTrustedIdentity(session);
      if (!trusted) {
        await client.auth.signOut();
        setIdentity(null);
        setAuthMessage("Your account is not enabled for calling.");
      } else {
        setIdentity(trusted);
        setAuthMessage("");
      }
      setAuthReady(true);
    };
    void acceptIdentitySessionFromUrl(client)
      .then(async (urlSession) => {
        if (urlSession) return acceptSession(urlSession);
        const { data } = await client.auth.getSession();
        return acceptSession(data.session);
      })
      .catch((error) => {
        setAuthMessage(
          error instanceof Error
            ? error.message
            : "Could not complete sign-in.",
        );
        setAuthReady(true);
      });
    const { data } = client.auth.onAuthStateChange(
      (_event, session) => void acceptSession(session),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const emitEvidence = (event: CallEvidence) => {
      if (event.event === "answered") {
        setPhase("connected");
        setStatus("Call connected.");
      }
      window.dispatchEvent(
        new CustomEvent("sabro:call-evidence", { detail: event }),
      );
      const endpoint = import.meta.env.VITE_EVIDENCE_ENDPOINT;
      const currentIdentity = identityRef.current;
      if (!endpoint || !currentIdentity) return;
      let url: URL;
      try {
        url = new URL(endpoint, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      void fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentIdentity.session.access_token}`,
        },
        body: JSON.stringify(event),
        credentials: "same-origin",
      }).catch(() => undefined);
    };
    vertoRef.current = new VertoClient(
      emitEvidence,
      (stream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          void audioRef.current.play().catch(() => undefined);
          void applyOutputDevice(audioRef.current, outputDeviceIdRef.current);
        }
        setPhase("connected");
        setStatus("Call connected.");
      },
      (cause) => {
        setPhase("ready");
        setElapsed(0);
        setStatus(`Call ended (${cause}).`);
      },
      () => inputDeviceIdRef.current,
    );
    return () => vertoRef.current?.close();
  }, []);

  useEffect(() => {
    if (phase !== "connected") return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!identity) {
      setContacts([]);
      return;
    }
    const store = contactStoreRef.current;
    if (!store) return;
    let cancelled = false;
    void hydrateContacts(identity.principalId, store, window.localStorage)
      .then((rows) => {
        if (!cancelled) setContacts(rows);
      })
      .catch(() => {
        if (!cancelled) setImportMessage("Could not load contacts.");
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    let cancelled = false;
    const refreshDevices = async () => {
      try {
        await media.getUserMedia({ audio: true, video: false });
      } catch {
        // Labels stay generic until the browser Allow prompt succeeds.
      }
      const listed = listAudioDevices(await media.enumerateDevices());
      if (cancelled) return;
      setInputDevices(listed.inputs);
      setOutputDevices(listed.outputs);
      setInputDeviceId(
        (current) => resolveAudioDevice(listed.inputs, current)?.deviceId ?? "",
      );
      setOutputDeviceId(
        (current) =>
          resolveAudioDevice(listed.outputs, current)?.deviceId ?? "",
      );
    };
    void refreshDevices();
    media.addEventListener("devicechange", refreshDevices);
    return () => {
      cancelled = true;
      media.removeEventListener("devicechange", refreshDevices);
    };
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    if (!phoneAccess) {
      vertoRef.current?.close();
      setPhase("idle");
      setStatus("Phone access is off.");
      return;
    }
    let cancelled = false;
    const prepareCalling = async () => {
      setPhase("connecting");
      setStatus("Getting calling ready…");
      try {
        await vertoRef.current?.connect(identity.session.access_token);
        if (cancelled) return;
        setPhase("ready");
        setStatus("Ready to call.");
      } catch {
        if (cancelled) return;
        setPhase("idle");
        setStatus("Calling isn’t available — try again.");
      }
    };
    void prepareCalling();
    return () => {
      cancelled = true;
    };
  }, [identity, phoneAccess]);

  useEffect(() => {
    if (!crmKeypadEntry) return;
    setSurface("keypad");
    const boundId = boundOpportunityId(opportunityId);
    if (!boundId) return;
    if (destinationFromSearch(new URLSearchParams(window.location.search))) {
      return;
    }
    if (parseCall4MeLocation(window.location).destination) {
      return;
    }
    if (typeof fetch !== "function") return;
    let cancelled = false;
    void fetchOpportunityDestination(boundId).then((phone) => {
      if (cancelled || !phone) return;
      setDestination((current) =>
        current.trim()
          ? current
          : formatKeypadDisplay(
              phone,
              identityRef.current?.homeCountry ?? "GB",
            ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [crmKeypadEntry, opportunityId]);

  async function requestLink() {
    const client = clientRef.current;
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await sendMagicLink(client, email);
      setAuthMessage("Check your invite email for the link or one-time code.");
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not send sign-in email.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitOtp() {
    const client = clientRef.current;
    if (!client) return;
    setAuthBusy(true);
    try {
      setIdentity(await verifyEmailOtp(client, email, otp));
      setOtp("");
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Code verification failed.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function startDial(number: string) {
    const boundId = boundOpportunityId(opportunityId);
    if (!allowUnboundOpportunity && !boundId) {
      setStatus("Add a valid Deal ID before calling.");
      return;
    }
    const homeCountry = identity?.homeCountry ?? "GB";
    const e164 = normalizeDialDestination(number, homeCountry);
    if (e164.replace(/\D/g, "").length < 3) {
      setStatus("Enter a valid number or extension.");
      return;
    }
    setPhase("dialing");
    setStatus("Calling...");
    try {
      const client = vertoRef.current;
      if (!client) throw new Error("Calling isn’t available — try again.");
      await client.dial(e164, boundId);
    } catch (error) {
      setPhase("ready");
      setStatus(error instanceof Error ? error.message : "Call failed.");
    }
  }

  startDialRef.current = startDial;

  useEffect(() => {
    const request =
      crmAutoDial ??
      (crmKeypadEntry && destination && !lastCrmAutoDialIdRef.current
        ? {
            id: initialIntent.t || "open",
            destination,
          }
        : null);
    if (!request) return;
    if (phase !== "ready") return;
    const homeCountry = identity?.homeCountry ?? "GB";
    const e164 = normalizeDialDestination(request.destination, homeCountry);
    if (e164.replace(/\D/g, "").length < 3) return;
    if (lastCrmAutoDialIdRef.current === request.id) return;
    lastCrmAutoDialIdRef.current = request.id;
    void startDialRef.current(request.destination);
  }, [
    crmAutoDial,
    crmKeypadEntry,
    destination,
    identity,
    initialIntent.t,
    phase,
  ]);

  async function dial() {
    await startDial(destination);
  }

  async function refreshContacts() {
    if (!identity) return;
    const store = contactStoreRef.current;
    if (!store) return;
    setContacts(
      await hydrateContacts(identity.principalId, store, window.localStorage),
    );
  }

  function resetContactForm() {
    setDraftName("");
    setDraftTelephone("");
    setAdding(false);
    setEditingId(null);
  }

  function startEdit(contact: Call4MeContact) {
    setPendingDelete(null);
    setOverflowContactId(null);
    setEditingId(contact.id);
    setDraftName(contact.name);
    setDraftTelephone(contact.telephone);
    setAdding(true);
    setImportMessage("");
  }

  async function submitContactForm() {
    if (!identity) return;
    const store = contactStoreRef.current;
    if (!store) return;
    try {
      if (editingId) {
        await updateContact(
          identity.principalId,
          editingId,
          {
            name: draftName,
            telephone: draftTelephone,
          },
          store,
        );
      } else {
        await addContact(
          identity.principalId,
          {
            name: draftName,
            telephone: draftTelephone,
          },
          store,
        );
      }
      await refreshContacts();
      resetContactForm();
      setImportMessage("");
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "Enter a name and telephone.",
      );
    }
  }

  async function confirmDelete() {
    if (!identity || !pendingDelete) return;
    const store = contactStoreRef.current;
    if (!store) return;
    try {
      await deleteContact(identity.principalId, pendingDelete.id, store);
      await refreshContacts();
      if (editingId === pendingDelete.id) resetContactForm();
      setPendingDelete(null);
      setImportMessage("");
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "Could not delete contact.",
      );
    }
  }

  async function importFromFile(file: File | undefined) {
    if (!identity || !file) return;
    const store = contactStoreRef.current;
    if (!store) return;
    try {
      const rows = await parseContactFile(file);
      const imported = await importContacts(identity.principalId, rows, store);
      await refreshContacts();
      setImportMessage(
        imported.length ? "" : "No contacts found in that file.",
      );
    } catch {
      setImportMessage("Could not read that file.");
    }
  }

  function callContact(contact: Call4MeContact) {
    const homeCountry = identity?.homeCountry ?? "GB";
    setDestination(formatKeypadDisplay(contact.telephone, homeCountry));
    void startDial(contact.telephone);
  }

  function pasteKeypad(event: ClipboardEvent<HTMLElement>) {
    const text = event.clipboardData.getData("text");
    if (!text.trim()) return;
    event.preventDefault();
    const homeCountry = identity?.homeCountry ?? "GB";
    setDestination(formatKeypadDisplay(text, homeCountry).slice(0, 18));
  }

  function exportPhoneBook() {
    const csv = exportContactsCsv(contacts);
    const link = document.createElement("a");
    link.download = "phone-book.csv";
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  }

  async function endCall() {
    setPhase("ending");
    setStatus("Ending call...");
    await vertoRef.current?.end();
    setPhase("ready");
    setElapsed(0);
    setStatus("Call ended.");
  }

  if (!authReady) {
    return (
      <main aria-live="polite" className="center-card">
        <p>Checking SABRO Identity...</p>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className={`auth-page${embeddedSurface ? " embedded" : ""}`}>
        <section className="auth-card" aria-label="SABRO Identity sign in">
          <p className="eyebrow">SABRO IDENTITY</p>
          <h1>Sign in to call</h1>
          <p className="muted">
            Invite-only access. Existing SABRO members can request a magic link
            or enter the email code.
          </p>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              value={email}
            />
          </label>
          <button
            disabled={authBusy || !clientRef.current}
            onClick={() => void requestLink()}
          >
            Send magic link
          </button>
          <div className="divider">
            <span>or enter code</span>
          </div>
          <label>
            One-time code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              value={otp}
            />
          </label>
          <button
            className="secondary"
            disabled={authBusy || !otp}
            onClick={() => void submitOtp()}
          >
            Verify code
          </button>
          {authMessage ? (
            <p className="message" role="status">
              {authMessage}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const active =
    phase === "dialing" || phase === "connected" || phase === "ending";
  const boundId = boundOpportunityId(opportunityId);
  const opportunityIsDialable = isOpportunityDialable(
    opportunityId,
    allowUnboundOpportunity,
  );
  const dialable =
    normalizeDialDestination(destination, identity.homeCountry).replace(
      /\D/g,
      "",
    ).length >= 3 && opportunityIsDialable;
  const dealFieldVisible = showDealIdField(
    allowUnboundOpportunity,
    embeddedSurface,
  );
  const visibleContacts = filterContacts(contacts, searchQuery);
  const showKeypad = phase === "connected";
  const seatUnreachable = !phoneAccess || phase === "idle";
  const hideAppSubnav = tenantShell;

  function subnavClass(item: CallSurface): string {
    return item === surface ? "call-subnav-item active" : "call-subnav-item";
  }

  function displayPhone(raw: string): string {
    return numberMaskLast4(raw, maskLast4Flag);
  }

  function contactInitials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function beginAddContact() {
    setPendingDelete(null);
    setOverflowContactId(null);
    setEditingId(null);
    setDraftName("");
    setDraftTelephone("");
    setAdding(true);
    setSurface("phonebook");
    setSettingsOpen(false);
  }

  function isTeamExtension(telephone: string): boolean {
    const digits = telephone.replace(/\D/g, "");
    return digits.length >= 3 && digits.length <= 4;
  }

  const teamContacts = visibleContacts.filter((c) =>
    isTeamExtension(c.telephone),
  );
  const customerContacts = visibleContacts.filter(
    (c) => !isTeamExtension(c.telephone),
  );
  const splitContacts = teamContacts.length > 0 && customerContacts.length > 0;
  const connectedLabel =
    phoneAccess && (phase === "ready" || phase === "connected")
      ? "Connected"
      : status;

  return (
    <main
      className={`app-shell${embeddedSurface ? " embedded" : ""}${shelfEmbedded ? " shelf-embedded" : ""}${tenantShell ? " tenant-shell" : ""}`}
    >
      {!embeddedSurface && !shelfEmbedded && !tenantShell ? (
        <header>
          <div>
            <p className="eyebrow">SABRO</p>
            <h1>Call4Me</h1>
          </div>
          <div className="identity">
            <span>{identity.email}</span>
            <button
              className="text-button"
              onClick={() => void clientRef.current?.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </header>
      ) : null}

      <section className="call-layout">
        <div className="call-card">
          <div className="status-row">
            <span className={`dot ${phase}`} />
            <span>{tenantShell ? connectedLabel : status}</span>
            <div className="call-settings-wrap">
              <button
                type="button"
                className={`settings-gear${seatUnreachable ? " settings-gear-warn" : ""}`}
                aria-label="Settings"
                aria-expanded={settingsOpen}
                aria-controls="call4me-settings-panel"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <span aria-hidden="true">⚙</span>
                {seatUnreachable ? (
                  <img
                    className="reachability-badge"
                    src="/icon-phone-access-wifi-bang.png"
                    alt="Phone not reachable"
                    width={18}
                    height={18}
                  />
                ) : null}
              </button>
              {settingsOpen ? (
                <div
                  id="call4me-settings-panel"
                  className="settings-panel"
                  role="region"
                  aria-label="Call settings"
                >
                  <label className="phone-access-label">
                    <input
                      type="checkbox"
                      checked={phoneAccess}
                      aria-label="Phone access"
                      onChange={(event) => {
                        setPhoneAccess(event.target.checked);
                      }}
                    />
                    Phone access
                  </label>
                  <section aria-label="Audio devices" className="call4me-devices">
                    <label className="call4me-device">
                      <span>Microphone</span>
                      <select
                        aria-label="Microphone device"
                        onChange={(event) => setInputDeviceId(event.target.value)}
                        value={inputDeviceId}
                      >
                        {inputDevices.length === 0 ? (
                          <option value="">No microphone found</option>
                        ) : (
                          inputDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="call4me-device">
                      <span>Speaker</span>
                      <select
                        aria-label="Speaker device"
                        onChange={(event) =>
                          setOutputDeviceId(event.target.value)
                        }
                        value={outputDeviceId}
                      >
                        {outputDevices.length === 0 ? (
                          <option value="">No speaker found</option>
                        ) : (
                          outputDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                  </section>
                  <div className="settings-contacts-actions">
                    <button
                      className="secondary"
                      onClick={beginAddContact}
                      type="button"
                    >
                      + Add
                    </button>
                    <label className="import-label">
                      Import
                      <input
                        accept=".csv,.xlsx,.xls,text/csv,text/plain"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void importFromFile(file);
                          setSurface("phonebook");
                          setSettingsOpen(false);
                        }}
                        type="file"
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={contacts.length === 0}
                      onClick={() => {
                        exportPhoneBook();
                        setSettingsOpen(false);
                      }}
                      type="button"
                    >
                      Export
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {dealFieldVisible ? (
            <label className="field">
              Deal ID
              <input
                aria-label="Deal ID"
                disabled={active}
                onChange={(e) => setOpportunityId(e.target.value)}
                placeholder="Paste the ID from the open deal"
                value={opportunityId}
              />
              <small>
                {boundId
                  ? "This call will be saved to the open deal."
                  : "Required before calling. Copy the ID from the open deal."}
              </small>
            </label>
          ) : boundId ? (
            <p className="deal-bound" role="status">
              This call will be saved to this deal.
            </p>
          ) : embeddedSurface && !allowUnboundOpportunity ? (
            <p className="message" role="status">
              Open this panel from a deal before calling.
            </p>
          ) : null}

          <div
            className={`communicator-body${crmKeypadEntry ? " crm-keypad" : ""}${hideAppSubnav ? " tenant-shell-body" : ""}`}
          >
            {hideAppSubnav ? null : crmKeypadEntry ? (
              <nav aria-label="Call" className="call-subnav call-subnav-crm">
                <button
                  aria-current={surface === "keypad" ? "page" : undefined}
                  className={subnavClass("keypad")}
                  onClick={() => setSurface("keypad")}
                  type="button"
                >
                  Keypad
                </button>
              </nav>
            ) : (
              <nav aria-label="Call4Me" className="call-subnav">
                <button
                  aria-current={surface === "activities" ? "page" : undefined}
                  className={subnavClass("activities")}
                  onClick={() => setSurface("activities")}
                  type="button"
                >
                  Today{"'"}s calls
                </button>
                <button
                  aria-current={surface === "extensions" ? "page" : undefined}
                  className={subnavClass("extensions")}
                  onClick={() => setSurface("extensions")}
                  type="button"
                >
                  Active deals
                </button>
                <button
                  aria-current={surface === "phonebook" ? "page" : undefined}
                  className={subnavClass("phonebook")}
                  onClick={() => setSurface("phonebook")}
                  type="button"
                >
                  Contacts
                </button>
              </nav>
            )}

            <div className="communicator-stage">
              {surface === "phonebook" && !crmKeypadEntry ? (
                <div className="contacts-panel">
                  <h2>Contacts</h2>
                  <label className="phonebook-search">
                    Search
                    <input
                      aria-label="Search contacts"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Name or number"
                      type="search"
                      value={searchQuery}
                    />
                  </label>
                  {adding ? (
                    <form
                      className="contact-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitContactForm();
                      }}
                    >
                      <label>
                        Name
                        <input
                          autoComplete="name"
                          onChange={(event) => setDraftName(event.target.value)}
                          value={draftName}
                        />
                      </label>
                      <label>
                        Telephone
                        <input
                          autoComplete="tel"
                          inputMode="tel"
                          onChange={(event) =>
                            setDraftTelephone(event.target.value)
                          }
                          type="tel"
                          value={draftTelephone}
                        />
                      </label>
                      <div className="contact-form-actions">
                        <button type="submit">
                          {editingId ? "Save" : "Add"}
                        </button>
                        <button
                          className="secondary"
                          onClick={() => {
                            resetContactForm();
                            setImportMessage("");
                          }}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {contacts.length === 0 && !adding ? (
                    <p className="muted">No contacts yet.</p>
                  ) : null}
                  {importMessage ? (
                    <p className="message" role="status">
                      {importMessage}
                    </p>
                  ) : null}
                  {pendingDelete ? (
                    <div
                      aria-label={`Delete ${pendingDelete.name}?`}
                      aria-modal="true"
                      className="contact-confirm"
                      role="dialog"
                    >
                      <p>Delete {pendingDelete.name}?</p>
                      <div className="contact-form-actions">
                        <button
                          onClick={() => void confirmDelete()}
                          type="button"
                        >
                          Confirm
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setPendingDelete(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {(() => {
                    const renderContactRow = (contact: Call4MeContact) => (
                      <li key={contact.id}>
                        <div className="contact-row-wrap">
                          <button
                            aria-label={`Call ${contact.name}`}
                            className="contact-row"
                            disabled={phase !== "ready" || active}
                            onClick={() => {
                              setOverflowContactId(null);
                              callContact(contact);
                            }}
                            type="button"
                            data-dial-target={contact.telephone}
                          >
                            <span
                              aria-hidden="true"
                              className="contact-avatar"
                            >
                              {contactInitials(contact.name) || "?"}
                            </span>
                            <span className="contact-row-text">
                              <span className="contact-name">
                                {contact.name}
                              </span>
                              <span className="contact-telephone">
                                {isTeamExtension(contact.telephone)
                                  ? `Ext ${contact.telephone.replace(/\D/g, "")}`
                                  : displayPhone(contact.telephone)}
                              </span>
                            </span>
                          </button>
                          <button
                            aria-label={`Edit ${contact.name}`}
                            className="icon-button contact-edit"
                            disabled={active}
                            onClick={() => {
                              setOverflowContactId(null);
                              startEdit(contact);
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">✏️</span>
                          </button>
                          <div className="contact-overflow">
                            <button
                              aria-expanded={overflowContactId === contact.id}
                              aria-haspopup="menu"
                              aria-label={`More actions for ${contact.name}`}
                              className="icon-button contact-more"
                              disabled={active}
                              onClick={() =>
                                setOverflowContactId((current) =>
                                  current === contact.id ? null : contact.id,
                                )
                              }
                              type="button"
                            >
                              <span aria-hidden="true">⋮</span>
                            </button>
                            {overflowContactId === contact.id ? (
                              <div
                                className="contact-overflow-menu"
                                role="menu"
                              >
                                <button
                                  aria-label={`Delete ${contact.name}`}
                                  disabled={active}
                                  onClick={() => {
                                    setAdding(false);
                                    setEditingId(null);
                                    setOverflowContactId(null);
                                    setPendingDelete(contact);
                                  }}
                                  role="menuitem"
                                  type="button"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );

                    if (visibleContacts.length === 0) return null;

                    if (splitContacts) {
                      return (
                        <>
                          <section aria-label="Team" className="contact-section">
                            <h3 className="contact-section-title">Team</h3>
                            <ul aria-label="Team contacts" className="contact-list">
                              {teamContacts.map(renderContactRow)}
                            </ul>
                          </section>
                          <section aria-label="Customers" className="contact-section">
                            <h3 className="contact-section-title">Customers</h3>
                            <ul aria-label="Customer contacts" className="contact-list">
                              {customerContacts.map(renderContactRow)}
                            </ul>
                          </section>
                        </>
                      );
                    }

                    return (
                      <ul aria-label="Contacts" className="contact-list">
                        {visibleContacts.map(renderContactRow)}
                      </ul>
                    );
                  })()}
                </div>
              ) : null}

              {surface === "extensions" && !crmKeypadEntry ? (
                <div className="extensions-panel">
                  <h2>Active deals</h2>
                  <ul aria-label="Active deals" className="craft-list">
                    {deals.length === 0 ? (
                      <li className="craft-list-empty" data-testid="active-deal-row">
                        <span className="craft-list-avatar" aria-hidden="true">
                          —
                        </span>
                        <span className="craft-list-body">
                          <span className="craft-list-title">No active deals</span>
                          <span className="craft-list-meta">
                            Deal rows will appear here when connected.
                          </span>
                        </span>
                        <span className="craft-list-time">—</span>
                      </li>
                    ) : (
                      deals.map((deal) => (
                        <li key={deal.id} data-testid="active-deal-row">
                          <button
                            aria-label={`Call ${deal.name}`}
                            className="craft-list-row"
                            disabled={
                              phase !== "ready" ||
                              active ||
                              !deal.telephone
                            }
                            onClick={() => {
                              if (!deal.telephone) return;
                              void startDialRef.current(deal.telephone);
                            }}
                            type="button"
                          >
                            <span aria-hidden="true" className="craft-list-avatar">
                              {contactInitials(deal.name) || "?"}
                            </span>
                            <span className="craft-list-body">
                              <span className="craft-list-title">{deal.name}</span>
                              <span className="craft-list-meta">
                                {deal.note || deal.stage || "Active deal"}
                              </span>
                            </span>
                            <span className="craft-list-time">
                              {deal.telephone
                                ? displayPhone(deal.telephone)
                                : "—"}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}

              {surface === "activities" && !crmKeypadEntry ? (
                <div className="activities-panel">
                  <h2>Today{"'"}s calls</h2>
                  <ul aria-label="Today's calls" className="craft-list">
                    {contacts.length === 0 ? (
                      <li
                        className="craft-list-empty"
                        data-testid="today-call-row"
                      >
                        <span className="craft-list-avatar" aria-hidden="true">
                          —
                        </span>
                        <span className="craft-list-body">
                          <span className="craft-list-title">No calls today.</span>
                          <span className="craft-list-meta">
                            Tap a contact to call
                          </span>
                        </span>
                        <span className="craft-list-time">—</span>
                      </li>
                    ) : (
                      contacts.map((contact) => (
                        <li key={contact.id} data-testid="today-call-row">
                          <button
                            aria-label={`Call ${contact.name}`}
                            className="craft-list-row"
                            disabled={phase !== "ready" || active}
                            onClick={() => callContact(contact)}
                            type="button"
                            data-dial-target={contact.telephone}
                          >
                            <span
                              aria-hidden="true"
                              className="craft-list-avatar"
                            >
                              {contactInitials(contact.name) || "?"}
                            </span>
                            <span className="craft-list-body">
                              <span className="craft-list-title">
                                {contact.name}
                              </span>
                              <span className="craft-list-meta">
                                Tap to call · {displayPhone(contact.telephone)}
                              </span>
                            </span>
                            <span className="craft-list-time">Today</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}

              <aside aria-label="Dialer" className="communicator-dialer">
                {tenantShell && !showKeypad && !active ? (
                  <div className="empty-call-stage" data-testid="empty-call-stage">
                    <p className="empty-call-stage-title">Tap a contact to call</p>
                    <p className="empty-call-stage-hint">
                      Keypad opens only during a call for DTMF
                    </p>
                  </div>
                ) : (
                <>
                <input
                  aria-label="Number to dial"
                  className="dial-display"
                  disabled={active}
                  inputMode="tel"
                  onChange={(event) =>
                    setDestination(event.target.value.slice(0, 18))
                  }
                  onPaste={pasteKeypad}
                  placeholder="Number or extension"
                  type="tel"
                  value={destination}
                />
                {showKeypad ? (
                  <fieldset
                    aria-label="Dial pad"
                    className="keypad"
                    onPaste={pasteKeypad}
                  >
                    {KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setDestination((v) => `${v}${key}`.slice(0, 18))
                        }
                      >
                        {key}
                      </button>
                    ))}
                  </fieldset>
                ) : null}
                <button
                  className="delete"
                  disabled={active || !destination}
                  onClick={() => setDestination((v) => v.slice(0, -1))}
                  type="button"
                >
                  Delete last digit
                </button>
                <button
                  className="call-button"
                  disabled={phase !== "ready" || !dialable}
                  onClick={() => void dial()}
                  type="button"
                >
                  {phase === "dialing" ? "Calling..." : "Call"}
                </button>
                </>
                )}
              </aside>
            </div>
          </div>
        </div>
      </section>

      {active ? (
        <aside className="in-call" aria-label="Active call">
          <span className="live-dot" />
          <div>
            <strong>{displayPhone(destination)}</strong>
            <span>
              {phase === "connected"
                ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                : status}
            </span>
          </div>
          <button disabled={phase === "ending"} onClick={() => void endCall()}>
            End call
          </button>
        </aside>
      ) : null}

      <audio aria-label="Call audio" autoPlay ref={audioRef} />
    </main>
  );
}
