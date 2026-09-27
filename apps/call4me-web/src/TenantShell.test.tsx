import { render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { clearTenantMapCache } from "./tenant-map";
import { TenantShell } from "./TenantShell";

const SYNTHETIC_TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function sessionWithClients(clientIds: unknown, accessToken = "access"): Session {
  return {
    access_token: accessToken,
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-id",
      aud: "authenticated",
      role: "authenticated",
      email: "seat@example.test",
      app_metadata: {
        principal_id: "11111111-1111-4111-8111-111111111111",
        client_ids: clientIds,
      },
      user_metadata: {},
      created_at: "2026-09-11T00:00:00Z",
    },
  } as Session;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchCall(
  fetchImpl: ReturnType<typeof vi.fn>,
  index = 0,
): [string, RequestInit | undefined] {
  const call = fetchImpl.mock.calls[index];
  expect(call).toBeDefined();
  return call as [string, RequestInit | undefined];
}

describe("TenantShell Stage A", () => {
  afterEach(() => {
    clearTenantMapCache();
    vi.restoreAllMocks();
  });

  it("renders the pipeline kanban for an allowed identity on /c/6402/pipeline", () => {
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    expect(screen.getByTestId("pipeline-kanban")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /pipeline kanban board/i })).toBeInTheDocument();
    expect(screen.queryByText(/Data not connected/i)).not.toBeInTheDocument();
  });

  it("renders a 403 view for /c/9999/pipeline even if the claim lists 9999", () => {
    render(
      <TenantShell
        pathname="/c/9999/pipeline"
        identityAppMetadata={sessionWithClients([9999]).user.app_metadata}
      />,
    );
    expect(screen.getByRole("heading", { name: /403/i })).toBeInTheDocument();
    expect(screen.queryByText(/Data not connected/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /tenant/i })).not.toBeInTheDocument();
  });

  it("renders a 403 view when the seat is allowed for 6402 but opens 6403", () => {
    render(
      <TenantShell
        pathname="/c/6403/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    expect(screen.getByRole("heading", { name: /403/i })).toBeInTheDocument();
  });

  it("performs no fetch on the unmapped empty shell", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <TenantShell
        pathname="/c/6402/deals"
        identityAppMetadata={sessionWithClients(["6402"]).user.app_metadata}
      />,
    );
    expect(screen.getByRole("heading", { name: /deal management/i })).toBeInTheDocument();
    expect(screen.getByText(/tenant not mapped — data disabled/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("replaces root /c/:clientId/ onto /c/:clientId/pipeline without a reload loop", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <TenantShell
        pathname="/c/6402/"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        onRedirect={(path) => {
          window.history.replaceState({}, "", path);
        }}
      />,
    );
    expect(replaceState).toHaveBeenCalledWith({}, "", "/c/6402/pipeline");
    expect(replaceState.mock.calls.length).toBe(1);
    expect(screen.queryByRole("navigation", { name: /tenant/i })).not.toBeInTheDocument();
  });

  it("renders a 401 sign-in prompt when identity is absent", () => {
    render(<TenantShell pathname="/c/6402/pipeline" identityAppMetadata={null} />);
    expect(screen.getByRole("heading", { name: /401|sign in/i })).toBeInTheDocument();
  });
});

describe("TenantShell Stage C tenant-map", () => {
  afterEach(() => {
    clearTenantMapCache();
    vi.restoreAllMocks();
  });

  it("maps an allowed 6402 seat via bridge and never renders the tenant UUID", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    const session = sessionWithClients([6402], "seat-token");
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={session.user.app_metadata}
        accessToken={session.access_token}
        fetchImpl={fetchImpl}
      />,
    );
    expect(screen.getByText(/Resolving tenant/i)).toBeInTheDocument();
    expect(await screen.findByTestId("pipeline-kanban")).toBeInTheDocument();
    expect(screen.queryByText(SYNTHETIC_TENANT_ID)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(SYNTHETIC_TENANT_ID);
    expect(fetchImpl).toHaveBeenCalled();
    const [url, init] = fetchCall(fetchImpl);
    expect(String(url)).toBe("/sabro-auth/tenant-map?client_id=6402");
    expect(String(url).startsWith("/sabro-auth/")).toBe(true);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer seat-token" });
  });

  it("fail-closed unmapped when bridge returns 404", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "missing" }));
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        accessToken="tok"
        fetchImpl={fetchImpl}
      />,
    );
    expect(await screen.findByTestId("pipeline-kanban")).toBeInTheDocument();
  });

  it.each([
    ["9999 unknown client", "/c/9999/pipeline", [9999], "tok-denied"],
    ["unauthenticated", "/c/6402/pipeline", null, "tok-denied"],
    ["cross-client 6403", "/c/6403/pipeline", [6402], "tok-denied"],
  ] as const)("fetch is never called for denied path: %s", async (_label, path, clients, token) => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    render(
      <TenantShell
        pathname={path}
        identityAppMetadata={clients ? sessionWithClients(clients).user.app_metadata : null}
        accessToken={token}
        fetchImpl={fetchImpl}
      />,
    );
    await waitFor(() => {
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it("allowed-only-[6402] opening /c/6403 denies with zero fetch", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6403, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    render(
      <TenantShell
        pathname="/c/6403/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        accessToken="tok"
        fetchImpl={fetchImpl}
      />,
    );
    expect(screen.getByRole("heading", { name: /403/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it("allowed 6402 seat makes exactly one tenant-map GET and no other network call", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    render(
      <TenantShell
        pathname="/c/6402/deals"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        accessToken="tok"
        fetchImpl={fetchImpl}
      />,
    );
    await screen.findByText(/Tenant mapped — data not connected yet/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchCall(fetchImpl)[0])).toBe("/sabro-auth/tenant-map?client_id=6402");
  });

  it("two identities never share a cached mapping for the same clientId", async () => {
    const otherId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === "Bearer seat-a") {
        return jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID });
      }
      return jsonResponse(200, { client_id: 6402, tenant_id: otherId });
    });

    const { unmount } = render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402], "seat-a").user.app_metadata}
        accessToken="seat-a"
        fetchImpl={fetchImpl}
      />,
    );
    await screen.findByTestId("pipeline-kanban");
    expect(document.body.innerHTML).not.toContain(SYNTHETIC_TENANT_ID);
    unmount();

    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402], "seat-b").user.app_metadata}
        accessToken="seat-b"
        fetchImpl={fetchImpl}
      />,
    );
    await screen.findByTestId("pipeline-kanban");
    expect(document.body.innerHTML).not.toContain(otherId);
    expect(fetchImpl.mock.calls.filter((c) => String(c[0]).includes("tenant-map")).length).toBe(2);
  });

  it("does not introduce NEXT_PUBLIC_TENANT_ID, MMPL, or Ice product strings", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        accessToken="tok"
        fetchImpl={fetchImpl}
      />,
    );
    await screen.findByTestId("pipeline-kanban");
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/NEXT_PUBLIC_TENANT_ID/);
    expect(html).not.toMatch(/MMPL/i);
    expect(html).not.toMatch(/\bIce\b/);
  });
});
