import { render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Call4Me } from "./sdk";
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

describe("Call4MeSurface Stage D dialer mount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unmapped tenant keeps empty card and does not mount the dialer", () => {
    const mountSpy = vi.spyOn(Call4Me, "mount");

    render(
      <TenantShell
        pathname="/c/6402/call4me"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
      />,
    );

    expect(screen.getByText(/Data not connected/i)).toBeInTheDocument();
    expect(
      screen.getByText(/tenant not mapped — data disabled/i),
    ).toBeInTheDocument();
    expect(mountSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("tab", { name: "Today's calls" }),
    ).toBeInTheDocument();
  });

  it("mapped tenant mounts the dialer once and hides the empty card", async () => {
    const unmount = vi.fn();
    const mountSpy = vi.spyOn(Call4Me, "mount").mockReturnValue({ unmount });

    render(
      <TenantShell
        pathname="/c/6402/call4me"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        lookupTenant={() => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}
      />,
    );

    await waitFor(() => {
      expect(mountSpy).toHaveBeenCalledTimes(1);
    });
    expect(mountSpy.mock.calls[0]?.[1]).toMatchObject({ theme: "sabro" });
    expect(screen.queryByText(/Data not connected/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/tenant mapped — data still not connected/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/tenant not mapped — data disabled/i),
    ).not.toBeInTheDocument();
  });

  it("unmount cleans up the dialer widget", async () => {
    const unmountFn = vi.fn();
    vi.spyOn(Call4Me, "mount").mockReturnValue({ unmount: unmountFn });

    const { unmount } = render(
      <TenantShell
        pathname="/c/6402/call4me"
        identityAppMetadata={sessionWithClients([6402]).user.app_metadata}
        lookupTenant={() => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}
      />,
    );

    await waitFor(() => {
      expect(Call4Me.mount).toHaveBeenCalled();
    });

    unmount();
    expect(unmountFn).toHaveBeenCalledTimes(1);
  });
});
