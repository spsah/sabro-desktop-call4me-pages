import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { STAGE0_CLIENT_IDS } from "./tenant-path";
import { TenantShell } from "./TenantShell";

function sessionWithClients(clientIds: unknown): Session {
  return {
    access_token: "access",
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

const ACCEPTED_NAV = [
  { label: "Pipeline", surface: "pipeline" },
  { label: "Deal Management", surface: "deals" },
  { label: "AI Insights", surface: "insights" },
  { label: "Call4Me", surface: "call4me" },
] as const;

const FORBIDDEN_IA = ["Overview", "Daily Missions", "Product GP%", "P&L", "Product", "P&L"];

function ShellHarness({
  initialPath,
  clientIds,
  lookupBrand,
}: {
  initialPath: string;
  clientIds: unknown;
  lookupBrand?: (clientId: string) => string | null;
}) {
  const [pathname, setPathname] = useState(initialPath);
  const go = (path: string) => {
    window.history.pushState({}, "", path);
    setPathname(path);
  };
  return (
    <>
      {/* Test-only probe: simulates in-app navigation to another client id. */}
      <button type="button" data-testid="cross-client-probe" onClick={() => go("/c/6403/pipeline")}>
        probe cross-client
      </button>
      <TenantShell
        pathname={pathname}
        identityAppMetadata={sessionWithClients(clientIds).user.app_metadata}
        lookupBrand={lookupBrand}
        onNavigate={go}
      />
    </>
  );
}

describe("TenantChrome Stage B", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders exactly four nav items with /c/<clientId>/ hrefs and active state", () => {
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /tenant/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);

    for (const item of ACCEPTED_NAV) {
      const link = within(nav).getByRole("link", { name: new RegExp(item.label, "i") });
      expect(link).toHaveAttribute("href", `/c/6402/${item.surface}`);
    }

    expect(within(nav).getByRole("link", { name: /pipeline/i })).toHaveClass("active");
    expect(within(nav).getByRole("link", { name: /deal management/i })).not.toHaveClass("active");
  });

  it("marks the matching nav item active per surface route", () => {
    const { rerender } = render(
      <TenantShell
        pathname="/c/6402/deals"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    const nav = screen.getByRole("navigation", { name: /tenant/i });
    expect(within(nav).getByRole("link", { name: /deal management/i })).toHaveClass("active");

    rerender(
      <TenantShell
        pathname="/c/6402/insights"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    expect(within(nav).getByRole("link", { name: /ai insights/i })).toHaveClass("active");

    rerender(
      <TenantShell
        pathname="/c/6402/call4me"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    expect(within(nav).getByRole("link", { name: /^call4me$/i })).toHaveClass("active");
  });

  it("does not render nav or brand on 401 / 403 / 404 views", () => {
    const { rerender } = render(
      <TenantShell pathname="/c/6402/pipeline" identityAppMetadata={null} />,
    );
    expect(screen.queryByRole("navigation", { name: /tenant/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sales Execution OS/i)).not.toBeInTheDocument();

    rerender(
      <TenantShell
        pathname="/c/6403/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    expect(screen.getByRole("heading", { name: /403/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /tenant/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sales Execution OS/i)).not.toBeInTheDocument();

    rerender(
      <TenantShell
        pathname="/c/6402/unknown"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    expect(screen.getByRole("heading", { name: /404/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /tenant/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sales Execution OS/i)).not.toBeInTheDocument();
  });

  it("uses brand fallback with clientId and never MMPL/Ice for all registry ids", () => {
    for (const id of STAGE0_CLIENT_IDS) {
      const { unmount } = render(
        <TenantShell
          pathname={`/c/${id}/pipeline`}
          identityAppMetadata={sessionWithClients([id]).user.app_metadata}
        />,
      );
      const brand = screen.getByText(new RegExp(`SABRO · Client ${id}`));
      expect(brand).toBeInTheDocument();
      const chrome = screen.getByTestId("tenant-chrome").textContent ?? "";
      expect(chrome).not.toMatch(/MMPL/i);
      expect(chrome).not.toMatch(/\bIce\b/i);
      unmount();
    }
  });

  it("Call4Me shows exactly three tabs and no /contacts link exists", () => {
    render(
      <TenantShell
        pathname="/c/6402/call4me"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Today's calls",
      "Active deals",
      "Contacts",
    ]);

    const links = screen.queryAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href") ?? "").not.toMatch(/\/contacts(?:\/|$|\?)/);
    }
    expect(screen.queryByRole("link", { name: /^contacts$/i })).not.toBeInTheDocument();
  });

  it("performs zero fetch calls on every allowed shell", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const surfaces = ["pipeline", "deals", "insights", "call4me"] as const;

    for (const surface of surfaces) {
      fetchSpy.mockClear();
      const { unmount } = render(
        <TenantShell
          pathname={`/c/6402/${surface}`}
          identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        />,
      );
      await waitFor(() => {
        expect(fetchSpy).not.toHaveBeenCalled();
      });
      unmount();
    }
  });

  it("does not render parked IA items (Overview, Daily Missions, Product, P&L)", () => {
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );
    for (const label of FORBIDDEN_IA) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: new RegExp(`^${label}$`, "i") })).not.toBeInTheDocument();
    }
  });

  it("re-runs the guard when navigating to a client the seat cannot open", () => {
    render(<ShellHarness initialPath="/c/6402/pipeline" clientIds={[6402]} />);

    expect(screen.getByRole("navigation", { name: /tenant/i })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cross-client-probe"));

    expect(screen.getByRole("heading", { name: /403/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /tenant/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sales Execution OS/i)).not.toBeInTheDocument();
  });

  it("uses injectable brand lookup when provided and still avoids MMPL/Ice defaults", () => {
    render(
      <TenantShell
        pathname="/c/6402/pipeline"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        lookupBrand={() => "Neutral Brand"}
      />,
    );
    expect(screen.getByText("Neutral Brand")).toBeInTheDocument();
    expect(screen.queryByText(/MMPL/i)).not.toBeInTheDocument();
  });
});
