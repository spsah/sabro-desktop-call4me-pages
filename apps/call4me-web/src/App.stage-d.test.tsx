import type { Session } from "@supabase/supabase-js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  createMemoryContactStore,
  type ContactStore,
} from "./contacts";
import { numberMaskLast4 } from "./number-mask";

const principalId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => {
  let onRemoteStream: ((stream: MediaStream) => void) | null = null;
  let onEvidence: ((event: { event: string }) => void) | null = null;
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    dial: vi.fn().mockImplementation(async () => {
      // Drive connected via evidence only — avoid jsdom audio.play() path.
      onEvidence?.({ event: "answered" });
      return "call-id";
    }),
    end: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    captureCallbacks(
      evidence: (event: { event: string }) => void,
      remote: (stream: MediaStream) => void,
    ) {
      onEvidence = evidence;
      onRemoteStream = remote;
    },
    clearRemote() {
      onRemoteStream = null;
      onEvidence = null;
    },
  };
});

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
      app_metadata: { principal_id: principalId },
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
      constructor(
        onEvidence: (event: { event: string }) => void,
        onRemoteStream: (stream: MediaStream) => void,
      ) {
        mocks.captureCallbacks(onEvidence, onRemoteStream);
      }
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

function renderApp(
  props: {
    numberMaskLast4?: boolean;
    tenantShell?: boolean;
    panel?: "contacts" | "todays-calls" | "active-deals";
    contactStore?: ContactStore;
  } = {},
) {
  const store = props.contactStore ?? createMemoryContactStore();
  render(<App {...props} contactStore={store} />);
  return store;
}

describe("Stage D App UX locks", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    mocks.connect.mockClear();
    mocks.dial.mockClear();
    mocks.clearRemote();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("does not render a DTMF keypad before a call is connected", async () => {
    renderApp();
    await readyContacts();
    expect(screen.queryByLabelText("Dial pad")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Phone access" }),
    ).not.toBeInTheDocument();
  });

  it("renders the DTMF keypad only when the call is connected", async () => {
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [{ id: "c1", name: "Ada", telephone: "+447700900123" }],
        ],
      ]),
    );
    renderApp({ contactStore: store });
    await readyContacts();
    expect(screen.queryByLabelText("Dial pad")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ada"));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith("+447700900123", undefined);
    });
    await waitFor(() => {
      expect(screen.getByText("Call connected.")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Dial pad")).toBeInTheDocument();
  });

  it("exposes Phone access only inside the gear/settings surface", async () => {
    renderApp();
    await readyContacts();

    expect(
      screen.queryByRole("button", { name: "Phone access" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Phone access")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Phone access")).toBeInTheDocument();
    expect(screen.getByText("Phone access")).toBeInTheDocument();
  });

  it("masks contact numbers in the row while dialing the full number", async () => {
    const full = "+447700900123";
    const store = createMemoryContactStore(
      new Map([
        [
          principalId,
          [{ id: "c1", name: "Ada Lovelace", telephone: full }],
        ],
      ]),
    );
    renderApp({ contactStore: store, numberMaskLast4: true });
    await readyContacts();

    expect(screen.getByText(numberMaskLast4(full))).toBeInTheDocument();
    expect(screen.queryByText(full)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ada Lovelace"));
    await waitFor(() => {
      expect(mocks.dial).toHaveBeenCalledWith(full, undefined);
    });
  });

  it("hides App subnav when tenantShell so shell tabs are the only IA", async () => {
    renderApp({ tenantShell: true, panel: "contacts" });
    await readyContacts();
    expect(
      screen.queryByRole("navigation", { name: "Call4Me" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contacts" })).toBeInTheDocument();
  });
});
