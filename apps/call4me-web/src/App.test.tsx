import type { Session } from "@supabase/supabase-js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import {
  type ContactStore,
  contactsStorageKey,
  createMemoryContactStore,
  parseContactImport,
} from "./contacts";

const dealId = "22222222-2222-4222-8222-222222222222";
const principalId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  dial: vi.fn().mockResolvedValue("call-id"),
  end: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
}));

const identityMeta = vi.hoisted(() => ({
  home_country: undefined as string | undefined,
}));

function trustedSession(): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-id",
      aud: "authenticated",
      role: "authenticated",
      email: "sabro@example.test",
      app_metadata: {
        principal_id: "11111111-1111-4111-8111-111111111111",
        ...(identityMeta.home_country
          ? { home_country: identityMeta.home_country }
          : {}),
      },
      user_metadata: {},
      created_at: "2026-09-11T00:00:00Z",
    },
  } as Session;
}

vi.mock("./identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./identity")>();
  return {
    ...actual,
    createIdentityClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: trustedSession() } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => undefined } },
        }),
        signOut: async () => undefined,
      },
    }),
    acceptIdentitySessionFromUrl: async () => null,
  };
});

vi.mock("./verto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./verto")>();
  return {
    ...actual,
    VertoClient: class MockVertoClient {
      connect = mocks.connect;
      dial = mocks.dial;
      end = mocks.end;
      close = mocks.close;
    },
  };
});

async function readyCall4Me() {
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: "Contacts" }),
    ).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByText("Ready to call.")).toBeInTheDocument();
  });
}

async function readyCrmOpenCall() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Keypad" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  await waitFor(() => {
    expect(screen.getByText("Ready to call.")).toBeInTheDocument();
  });
  expect(
    screen.queryByRole("heading", { name: /contacts|Contacts/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Contacts" }),
  ).not.toBeInTheDocument();
}

function typeDestination(digits: string) {
  fireEvent.change(screen.getByLabelText("Number to dial"), {
    target: { value: digits },
  });
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  return screen.getByRole("region", { name: "Call settings" });
}

function openAddContact() {
  openSettings();
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
}

function openContactDelete(name: string) {
  fireEvent.click(
    screen.getByRole("button", { name: `More actions for ${name}` }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: `Delete ${name}` }));
}

async function expectDialed(e164: string, display = e164) {
  await waitFor(() => {
    expect(mocks.dial).toHaveBeenCalledWith(e164, undefined);
  });
  expect(screen.getByLabelText("Active call")).toHaveTextContent(display);
}

function renderApp(
  props: {
    allowUnboundOpportunity?: boolean;
    embedded?: boolean;
    opportunityId?: string;
    contactStore?: ContactStore;
    numberMaskLast4?: boolean;
    tenantShell?: boolean;
  } = {},
) {
  const store = props.contactStore ?? createMemoryContactStore();
  // Existing suite asserts unmasked display; Stage D mask covered in App.stage-d.test.tsx
  render(
    <App numberMaskLast4={false} {...props} contactStore={store} />,
  );
  return store;
}

describe("Call4Me shelf and standalone dialer", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    identityMeta.home_country = undefined;
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
    window.name = "";
    vi.spyOn(window, "focus").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
    window.name = "";
  });

  it("adds a contact from the Call4Me home list", async () => {
    renderApp();
    await readyCall4Me();

    openAddContact();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "+447700900123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });
    expect(screen.getByText("+447700900123")).toBeInTheDocument();
    expect(
      window.localStorage.getItem(contactsStorageKey(principalId)),
    ).toBeNull();
  });

  it("imports a CSV row onto the tenant-local contact list", async () => {
    renderApp();
    await readyCall4Me();

    const file = new File(
      ["name,telephone\nBea,+441932584132\n"],
      "people.csv",
      { type: "text/csv" },
    );
    openSettings();
    fireEvent.change(screen.getByLabelText("Import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText("Bea")).toBeInTheDocument();
    });
    expect(screen.getByText("+441932584132")).toBeInTheDocument();
  });

  it("fills the pad and starts an in-app dial when a contact is clicked", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "open").mockImplementation(assign as never);

    renderApp();
    await readyCall4Me();

    openAddContact();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Office" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "01932584132" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => {
      expect(screen.getByText("Office")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Office"));

    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+441932584132", undefined);
    });
    expect(screen.getByLabelText("Active call")).toHaveTextContent(
      "01932584132",
    );
    expect(screen.queryByRole("link", { name: /tel:/i })).toBeNull();
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("does not use tel: or an OS dialer as the Call4Me product path", async () => {
    const { container } = render(
      <App contactStore={createMemoryContactStore()} />,
    );
    await readyCall4Me();
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/tel:/i);
  });

  it("hides Deal ID on standalone and enables Call after three digits", async () => {
    renderApp();
    await readyCall4Me();

    expect(screen.queryByLabelText("Deal ID")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Required before calling/),
    ).not.toBeInTheDocument();

    const call = screen.getByRole("button", { name: "Call" });
    expect(call).toBeDisabled();

    typeDestination("12");
    expect(call).toBeDisabled();
    typeDestination("123");
    expect(call).toBeEnabled();

    fireEvent.click(call);
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("123", undefined);
    });
  });

  it("hides Deal ID on the shelf embed and dials without a deal", async () => {
    window.history.replaceState({}, "", "/index.html?embedded=shelf");
    renderApp();
    await readyCall4Me();

    expect(screen.queryByLabelText("Deal ID")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Open this panel from a deal/),
    ).not.toBeInTheDocument();

    typeDestination("077");
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("077", undefined);
    });
  });

  it("binds a valid opportunityId quietly without a paste field", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=shelf&opportunityId=${dealId}`,
    );
    renderApp();
    await readyCall4Me();

    expect(screen.queryByLabelText("Deal ID")).not.toBeInTheDocument();
    expect(
      screen.getByText("This call will be saved to this deal."),
    ).toBeInTheDocument();

    typeDestination("456");
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("456", dealId);
    });
  });

  it("ignores an invalid opportunityId query when unbound", async () => {
    window.history.replaceState({}, "", "/index.html?opportunityId=not-a-deal");
    renderApp();
    await readyCall4Me();

    expect(screen.queryByLabelText("Deal ID")).not.toBeInTheDocument();
    expect(screen.queryByText(/saved to this deal/)).not.toBeInTheDocument();

    typeDestination("890");
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("890", undefined);
    });
  });

  it("keeps Deal ID required when unbound calling is off", async () => {
    renderApp({ allowUnboundOpportunity: false });
    await readyCall4Me();

    expect(screen.getByLabelText("Deal ID")).toBeInTheDocument();
    expect(screen.getByText(/Required before calling/)).toBeInTheDocument();

    const call = screen.getByRole("button", { name: "Call" });
    expect(call).toBeDisabled();
  });

  it("binds a CRM-embed opportunityId without showing a paste field", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&opportunityId=${dealId}`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();

    expect(screen.queryByLabelText("Deal ID")).not.toBeInTheDocument();
    expect(
      screen.getByText("This call will be saved to this deal."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Number to dial")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dial pad")).not.toBeInTheDocument();
    expect(mocks.dial).not.toHaveBeenCalled();
  });

  it("lands CRM Open Call on the keypad with the deal number filled and dials", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad&opportunityId=${dealId}&destination=07747448677`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();

    expect(screen.getByLabelText("Number to dial")).toHaveValue(
      "07747448677",
    );
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447747448677", dealId);
    });
    expect(screen.getByLabelText("Active call")).toHaveTextContent(
      "07747448677",
    );
  });

  it("lands CRM Open Call from hash dest without putting dest in the query", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07747448677`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();

    expect(screen.getByLabelText("Number to dial")).toHaveValue(
      "07747448677",
    );
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447747448677", dealId);
    });
  });

  it("updates keypad dest in-place when a second CRM Open Call intent arrives", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();

    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07722222222`,
    );
    window.dispatchEvent(new Event("hashchange"));

    await waitFor(() => {
      expect(screen.getByLabelText("Number to dial")).toHaveValue(
        "07722222222",
      );
    });
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447722222222", dealId);
    });
  });

  it("auto-dials on a BroadcastChannel reuse intent without hashchange", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();

    const channel = new BroadcastChannel("sabro-call4me");
    channel.postMessage({
      destination: "07722222222",
      opportunityId: dealId,
      panel: "keypad",
      t: "channel-reuse-dest",
    });
    channel.close();

    await waitFor(() => {
      expect(screen.getByLabelText("Number to dial")).toHaveValue(
        "07722222222",
      );
    });
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447722222222", dealId);
    });
  });

  it("auto-dials the same dest again on a second Open Call reuse intent", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "sabro.call4me.intent",
        newValue: JSON.stringify({
          destination: "07711111111",
          opportunityId: dealId,
          panel: "keypad",
          t: "same-dest-reuse-2",
        }),
      }),
    );

    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
  });

  it("auto-dials after named-tab hash update + focus when hashchange does not fire", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();

    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07744444444&t=focus-hash-reuse`,
    );
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(screen.getByLabelText("Number to dial")).toHaveValue(
        "07744444444",
      );
    });
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447744444444", dealId);
    });
  });

  it("auto-dials 2nd+ Open Call on named-tab reuse when HTMLAnchorElement is undefined", async () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
    );
    renderApp({ embedded: true, opportunityId: dealId });
    await readyCrmOpenCall();
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();

    const {
      CALL4ME_WINDOW_NAME,
      handleOpenCallClick,
      markCall4MeSurfaceAlive,
    } = await import("./crm-open-call");
    markCall4MeSurfaceAlive();

    const globalObject = globalThis as typeof globalThis & {
      HTMLAnchorElement?: unknown;
    };
    const originalCtor = globalObject.HTMLAnchorElement;
    const hadOwn = Object.hasOwn(globalObject, "HTMLAnchorElement");
    Reflect.deleteProperty(globalObject, "HTMLAnchorElement");
    try {
      const anchor = document.createElement("a");
      anchor.setAttribute(
        "href",
        `/call4me/?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
      );
      anchor.setAttribute("target", CALL4ME_WINDOW_NAME);
      const prevented: boolean[] = [];
      expect(() =>
        handleOpenCallClick(
          {
            preventDefault: () => {
              prevented.push(true);
            },
            currentTarget: anchor,
          },
          { opportunityId: dealId, destination: "07711111111" },
        ),
      ).not.toThrow();
      expect(prevented).toHaveLength(0);
      const href = anchor.getAttribute("href") ?? "";
      const parsed = new URL(href, "https://app.sabro.cloud");
      expect(
        new URLSearchParams(parsed.hash.replace(/^#/, "")).get("t"),
      ).toBeTruthy();
      window.history.replaceState(
        {},
        "",
        `/index.html${parsed.search}${parsed.hash}`,
      );
      window.dispatchEvent(new Event("focus"));
    } finally {
      if (hadOwn) {
        globalObject.HTMLAnchorElement = originalCtor;
      }
    }

    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447711111111", dealId);
    });
  });

  it("fills the CRM keypad from the opportunity phone when the query has no destination", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/rest/opportunities/")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              opportunity: {
                id: dealId,
                pointOfContact: {
                  phones: {
                    primaryPhoneCallingCode: "+44",
                    primaryPhoneNumber: "7747448677",
                  },
                },
              },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      window.history.replaceState(
        {},
        "",
        `/index.html?embedded=twenty&opportunityId=${dealId}`,
      );
      renderApp({ embedded: true, opportunityId: dealId });
      await readyCrmOpenCall();

      await waitFor(() => {
        expect(screen.getByLabelText("Number to dial")).toHaveValue(
          "07747448677",
        );
      });
      await waitFor(() => {
        expect(mocks.dial).toHaveBeenCalledWith("+447747448677", dealId);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("dials a +44 contact through the same normalize path as keypad", async () => {
    renderApp();
    await readyCall4Me();

    openAddContact();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "UK E164" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "+447747448677" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => {
      expect(screen.getByText("UK E164")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("UK E164"));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447747448677", undefined);
    });
    expect(screen.getByLabelText("Active call")).toHaveTextContent(
      "07747448677",
    );
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
  });

  it("dials a 07 contact through the same normalize path as keypad", async () => {
    renderApp();
    await readyCall4Me();

    openAddContact();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "UK National" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "07474486777" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => {
      expect(screen.getByText("UK National")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("UK National"));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447474486777", undefined);
    });
    expect(screen.getByLabelText("Active call")).toHaveTextContent(
      "07474486777",
    );
  });

  it("shows the same list on a second store after an add (cross-device)", async () => {
    const records = new Map();
    const deviceA = createMemoryContactStore(records);
    const deviceB = createMemoryContactStore(records);
    renderApp({ contactStore: deviceA });
    await readyCall4Me();

    openAddContact();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "+447700900123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });

    expect(await deviceB.list(principalId)).toEqual([
      expect.objectContaining({
        name: "Ada Lovelace",
        telephone: "+447700900123",
      }),
    ]);
  });

  it("reuses Desktop microphone and speaker pickers on the web shelf", async () => {
    const enumerateDevices = vi.fn().mockResolvedValue([
      { deviceId: "mic-1", label: "Headset Microphone", kind: "audioinput" },
      { deviceId: "spk-1", label: "Headset Earphone", kind: "audiooutput" },
    ]);
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [],
      getAudioTracks: () => [],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    renderApp();
    await readyCall4Me();
    openSettings();
    await waitFor(() => {
      expect(screen.getByLabelText("Microphone device")).toHaveDisplayValue(
        "Headset Microphone",
      );
    });
    expect(screen.getByLabelText("Speaker device")).toHaveDisplayValue(
      "Headset Earphone",
    );
    fireEvent.change(screen.getByLabelText("Speaker device"), {
      target: { value: "spk-1" },
    });
    expect(screen.getByLabelText("Audio devices")).toBeInTheDocument();
  });

  it("dials L0 UK national and +44 contacts through the same destination", async () => {
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [
            {
              id: "uk-national",
              name: "UK National L0",
              telephone: "07747448677",
            },
            {
              id: "uk-e164",
              name: "UK E164 L0",
              telephone: "+447747448677",
            },
          ],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyCall4Me();

    fireEvent.click(screen.getByText("UK National L0"));
    await expectDialed("+447747448677", "07747448677");

    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();
    fireEvent.click(screen.getByText("UK E164 L0"));
    await expectDialed("+447747448677", "07747448677");
  });

  it("dials the L0 UK national number from the keypad", async () => {
    renderApp();
    await readyCall4Me();
    typeDestination("07747448677");
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await expectDialed("+447747448677", "07747448677");
  });

  it("fills the number field with UK 07 after pasting +44 and still egresses E.164", async () => {
    renderApp();
    await readyCall4Me();
    fireEvent.paste(screen.getByLabelText("Number to dial"), {
      clipboardData: { getData: () => "+447747448677" },
    });
    expect(screen.getByLabelText("Number to dial")).toHaveValue("07747448677");
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await expectDialed("+447747448677", "07747448677");
  });

  it("dials IN national using Identity home_country 91, not UK 44", async () => {
    identityMeta.home_country = "IN";
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [
            {
              id: "in-mobile",
              name: "IN Mobile",
              telephone: "9876543210",
            },
            {
              id: "in-trunk",
              name: "IN Trunk",
              telephone: "07747448677",
            },
          ],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyCall4Me();
    fireEvent.click(screen.getByText("IN Mobile"));
    await expectDialed("+919876543210", "9876543210");

    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => {
      expect(screen.getByText("Call ended.")).toBeInTheDocument();
    });
    mocks.dial.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Contacts" }));
    fireEvent.click(screen.getByText("IN Trunk"));
    await expectDialed("+917747448677", "7747448677");
  });

  it("restores a stripped trunk 0 when a 07 contact is clicked", async () => {
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [
            {
              id: "stripped",
              name: "Stripped National",
              telephone: "7747448677",
            },
          ],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyCall4Me();
    fireEvent.click(screen.getByText("Stripped National"));
    await expectDialed("+447747448677", "07747448677");
  });

  it.each([
    {
      name: "BT desk",
      telephone: "0800800800",
      dest: "+44800800800",
      display: "0800800800",
    },
    {
      name: "BT alt",
      telephone: "0800800150",
      dest: "+44800800150",
      display: "0800800150",
    },
    {
      name: "BT desk E164",
      telephone: "+44800800800",
      dest: "+44800800800",
      display: "0800800800",
    },
    {
      name: "BT alt E164",
      telephone: "+44800800150",
      dest: "+44800800150",
      display: "0800800150",
    },
  ])(
    "dials BT test $telephone from a contact",
    async ({ name, telephone, dest, display }) => {
      const store = createMemoryContactStore(
        new Map([[principalId, [{ id: `bt-${dest}`, name, telephone }]]]),
      );
      renderApp({ contactStore: store });
      await readyCall4Me();
      fireEvent.click(screen.getByText(name));
      await expectDialed(dest, display);
    },
  );

  it.each([
    { digits: "0800800800", dest: "+44800800800" },
    { digits: "0800800150", dest: "+44800800150" },
  ])("dials BT test $digits from the keypad", async ({ digits, dest }) => {
    renderApp();
    await readyCall4Me();
    typeDestination(digits);
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await expectDialed(dest, digits);
  });

  it("edits a contact name and telephone in the Identity-synced list", async () => {
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [
            {
              id: "contact-ada",
              name: "Ada Lovelace",
              telephone: "+447700900123",
            },
          ],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyCall4Me();

    fireEvent.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Byron" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "07747448677" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Ada Byron")).toBeInTheDocument();
    });
    expect(screen.getByText("07747448677")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(await store.list(principalId)).toEqual([
      {
        id: "contact-ada",
        name: "Ada Byron",
        telephone: "07747448677",
      },
    ]);
    expect(
      window.localStorage.getItem(contactsStorageKey(principalId)),
    ).toBeNull();
  });

  it("deletes a contact after confirm and keeps the other rows", async () => {
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [
            {
              id: "contact-ada",
              name: "Ada Lovelace",
              telephone: "+447700900123",
            },
            {
              id: "contact-bea",
              name: "Bea",
              telephone: "07700900456",
            },
          ],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyCall4Me();

    openContactDelete("Ada Lovelace");
    expect(
      screen.getByRole("dialog", { name: "Delete Ada Lovelace?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    openContactDelete("Ada Lovelace");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Bea")).toBeInTheDocument();
    expect(await store.list(principalId)).toEqual([
      { id: "contact-bea", name: "Bea", telephone: "07700900456" },
    ]);
    expect(
      window.localStorage.getItem(contactsStorageKey(principalId)),
    ).toBeNull();
  });
});

function largePhoneBookCsv(count = 120): string {
  const rows = ["name,telephone"];
  for (let index = 1; index <= count; index += 1) {
    if (index === 77) {
      rows.push("Zara Ahmed,+441932584132");
      continue;
    }
    rows.push(
      `Person ${String(index).padStart(3, "0")},+4477009${String(index).padStart(5, "0")}`,
    );
  }
  return `${rows.join("\n")}\n`;
}

function importCsvFile(csv: string, fileName = "people.csv") {
  const file = new File([csv], fileName, { type: "text/csv" });
  openSettings();
  fireEvent.change(screen.getByLabelText("Import"), {
    target: { files: [file] },
  });
}

async function readyPhoneBook() {
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: "Contacts" }),
    ).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByText("Ready to call.")).toBeInTheDocument();
  });
}

describe("CR-CALL4ME-COMMUNICATOR-PHONEBOOK-UX-001 Phase 1", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    identityMeta.home_country = undefined;
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  it("shows Today's calls, Active deals, Contacts, and an empty Today's calls placeholder", async () => {
    renderApp();
    await readyPhoneBook();

    const subnav = screen.getByRole("navigation", { name: "Call4Me" });
    expect(subnav).toHaveTextContent("Today's calls");
    expect(subnav).toHaveTextContent("Active deals");
    expect(subnav).toHaveTextContent("Contacts");
    expect(
      screen.getByRole("button", { name: "Contacts" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("button", { name: "Keypad" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today's calls" }));
    expect(
      screen.getByRole("heading", { name: "Today's calls" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No calls today.")).toBeInTheDocument();
    expect(screen.queryByText(/Odoo/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Dialer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dial pad")).not.toBeInTheDocument();
  });

  it("filters imported ≥100 contacts by name and number", async () => {
    renderApp();
    await readyPhoneBook();
    importCsvFile(largePhoneBookCsv());

    await waitFor(() => {
      expect(screen.getByText("Zara Ahmed")).toBeInTheDocument();
    });
    expect(screen.getByText("Person 001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search contacts"), {
      target: { value: "Zara" },
    });
    expect(screen.getByText("Zara Ahmed")).toBeInTheDocument();
    expect(screen.queryByText("Person 001")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search contacts"), {
      target: { value: "1932584132" },
    });
    expect(screen.getByText("Zara Ahmed")).toBeInTheDocument();
    expect(screen.queryByText("Person 002")).not.toBeInTheDocument();
  });

  it("click-to-calls in panel without a tab hop, window.open, or tel:", async () => {
    const href = window.location.href;
    vi.spyOn(window, "open").mockImplementation(vi.fn() as never);

    renderApp();
    await readyPhoneBook();

    openAddContact();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Office" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "01932584132" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => {
      expect(screen.getByText("Office")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Dialer")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Office"));

    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+441932584132", undefined);
    });
    expect(
      screen.getByRole("button", { name: "Contacts" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Number to dial")).toHaveValue("01932584132");
    expect(screen.getByLabelText("Active call")).toHaveTextContent(
      "01932584132",
    );
    expect(window.location.href).toBe(href);
    expect(window.open).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
    expect(screen.queryByRole("link", { name: /tel:/i })).toBeNull();
  });

  it("exports an imported CSV round-trip of name and telephone", async () => {
    let href = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        href = this.getAttribute("href") ?? "";
      });
    vi.spyOn(window, "open").mockImplementation(vi.fn() as never);

    renderApp();
    await readyPhoneBook();
    importCsvFile(
      "name,telephone\nAda Lovelace,+447700900123\nBea,07700900456\n",
    );
    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(click).toHaveBeenCalled();
    expect(href).toMatch(/^data:text\/csv;charset=utf-8,/);
    const exported = decodeURIComponent(
      href.replace(/^data:text\/csv;charset=utf-8,/, ""),
    );
    expect(parseContactImport(exported)).toEqual([
      { name: "Ada Lovelace", telephone: "+447700900123" },
      { name: "Bea", telephone: "07700900456" },
    ]);
    expect(window.open).not.toHaveBeenCalled();
  });

  it("edits and deletes through the Identity-synced store from Contacts", async () => {
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [
            {
              id: "contact-ada",
              name: "Ada Lovelace",
              telephone: "+447700900123",
            },
            {
              id: "contact-bea",
              name: "Bea",
              telephone: "07700900456",
            },
          ],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyPhoneBook();

    fireEvent.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Byron" },
    });
    fireEvent.change(screen.getByLabelText("Telephone"), {
      target: { value: "07747448677" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Ada Byron")).toBeInTheDocument();
    });
    expect(await store.list(principalId)).toEqual([
      {
        id: "contact-ada",
        name: "Ada Byron",
        telephone: "07747448677",
      },
      { id: "contact-bea", name: "Bea", telephone: "07700900456" },
    ]);

    openContactDelete("Ada Byron");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(screen.queryByText("Ada Byron")).not.toBeInTheDocument();
    });
    expect(await store.list(principalId)).toEqual([
      { id: "contact-bea", name: "Bea", telephone: "07700900456" },
    ]);
    expect(
      window.localStorage.getItem(contactsStorageKey(principalId)),
    ).toBeNull();
  });
});
