import type { Session } from "@supabase/supabase-js";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import {
  type ContactStore,
  createMemoryContactStore,
} from "./contacts";

const principalId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  dial: vi.fn().mockResolvedValue("call-id"),
  end: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
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
        principal_id: principalId,
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

async function readyContacts() {
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: "Contacts" }),
    ).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(
      screen.getByText(/Ready to call\.|Connected/),
    ).toBeInTheDocument();
  });
}

function renderApp(contactStore?: ContactStore) {
  render(
    <App
      numberMaskLast4={false}
      contactStore={contactStore ?? createMemoryContactStore()}
    />,
  );
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  return screen.getByRole("region", { name: "Call settings" });
}

describe("craft-gap Contacts row affordances", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("has no visible Call text button; row tap dials; pencil edit only; Delete only via overflow", async () => {
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
    renderApp(store);
    await readyContacts();

    const contactList = screen.getByRole("list", { name: "Contacts" });
    const row = within(contactList).getByRole("button", {
      name: "Call Ada Lovelace",
    });
    expect(within(row).queryByText(/^Call$/)).not.toBeInTheDocument();
    expect(
      within(contactList).queryByRole("button", { name: /^Call$/ }),
    ).not.toBeInTheDocument();

    const edit = within(contactList).getByRole("button", {
      name: "Edit Ada Lovelace",
    });
    expect(edit).toHaveTextContent("✏️");

    expect(
      within(contactList).queryByRole("button", {
        name: "Delete Ada Lovelace",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(contactList).getByRole("button", {
        name: "More actions for Ada Lovelace",
      }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Delete Ada Lovelace" }),
    ).toBeInTheDocument();

    fireEvent.click(row);
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447700900123", undefined);
    });
  });
});

describe("craft-gap Contacts toolbar vs settings", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("keeps front toolbar search-only; Import/Export/+Add live in settings", async () => {
    renderApp();
    await readyContacts();

    expect(screen.getByLabelText("Search contacts")).toBeInTheDocument();
    expect(document.querySelector(".contacts-toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Import")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();

    const panel = openSettings();
    expect(within(panel).getByRole("button", { name: "+ Add" })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Import")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Phone access")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Microphone device")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Speaker device")).toBeInTheDocument();
  });
});

describe("craft-gap Today's calls and Active deals list layouts", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("renders Today's calls as a list structure when empty", async () => {
    renderApp();
    await readyContacts();

    fireEvent.click(screen.getByRole("button", { name: "Today's calls" }));
    expect(
      screen.getByRole("heading", { name: "Today's calls" }),
    ).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Today's calls" });
    expect(list).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Active deals as a list structure when empty", async () => {
    renderApp();
    await readyContacts();

    fireEvent.click(screen.getByRole("button", { name: "Active deals" }));
    expect(
      screen.getByRole("heading", { name: "Active deals" }),
    ).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Active deals" });
    expect(list).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(1);
  });
});

describe("craft-gap tenantShell empty stage", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("shows Tap a contact empty stage without idle keypad", async () => {
    render(
      <App
        tenantShell
        panel="contacts"
        numberMaskLast4={false}
        contactStore={createMemoryContactStore()}
      />,
    );
    await readyContacts();
    expect(screen.getByText("Tap a contact to call")).toBeInTheDocument();
    expect(
      screen.getByText("Keypad opens only during a call for DTMF"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Dial pad")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Number to dial")).not.toBeInTheDocument();
  });
});