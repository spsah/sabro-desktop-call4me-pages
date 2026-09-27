import type { Session } from "@supabase/supabase-js";
import {
  acceptIdentitySessionFromUrl,
  extractTrustedIdentity,
} from "./identity";

function session(
  appMetadata: Record<string, unknown>,
  userMetadata: Record<string, unknown> = {},
): Session {
  return {
    access_token: "redacted",
    refresh_token: "redacted",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-id",
      aud: "authenticated",
      role: "authenticated",
      email: "tom@example.test",
      app_metadata: appMetadata,
      user_metadata: userMetadata,
      created_at: "2026-09-11T00:00:00Z",
    },
  };
}

describe("extractTrustedIdentity", () => {
  it("accepts a UUID only from trusted app_metadata", () => {
    const principalId = "11111111-1111-4111-8111-111111111111";
    expect(
      extractTrustedIdentity(session({ principal_id: principalId }))
        ?.principalId,
    ).toBe(principalId);
  });

  it("defaults home_country to GB when Identity schema has not stamped it", () => {
    const principalId = "11111111-1111-4111-8111-111111111111";
    expect(
      extractTrustedIdentity(session({ principal_id: principalId }))
        ?.homeCountry,
    ).toBe("GB");
  });

  it("reads home_country from trusted app_metadata for national dials without CC", () => {
    const principalId = "11111111-1111-4111-8111-111111111111";
    expect(
      extractTrustedIdentity(
        session({ principal_id: principalId, home_country: "IN" }),
      )?.homeCountry,
    ).toBe("IN");
    expect(
      extractTrustedIdentity(
        session({ principal_id: principalId, home_country: "gb" }),
      )?.homeCountry,
    ).toBe("GB");
  });

  it("ignores a forged user_metadata home_country", () => {
    const principalId = "11111111-1111-4111-8111-111111111111";
    expect(
      extractTrustedIdentity(
        session({ principal_id: principalId }, { home_country: "IN" }),
      )?.homeCountry,
    ).toBe("GB");
  });

  it("refuses a user_metadata principal", () => {
    expect(
      extractTrustedIdentity(
        session(
          {},
          {
            principal_id: "11111111-1111-4111-8111-111111111111",
          },
        ),
      ),
    ).toBeNull();
  });

  it("refuses malformed app_metadata principal values", () => {
    expect(
      extractTrustedIdentity(session({ principal_id: "sabro-local-tom" })),
    ).toBeNull();
  });

  it("accepts an admin invite fragment and removes tokens from the URL", async () => {
    const trustedSession = session({
      principal_id: "11111111-1111-4111-8111-111111111111",
    });
    const setSession = vi
      .fn()
      .mockResolvedValue({ data: { session: trustedSession }, error: null });
    const replaceState = vi.spyOn(window.history, "replaceState");
    const result = await acceptIdentitySessionFromUrl(
      { auth: { setSession } } as never,
      {
        hash: "#access_token=access&refresh_token=refresh&type=magiclink",
        pathname: "/sabro-desktop-call4me-pages/",
        search: "",
      } as Location,
    );
    expect(result).toBe(trustedSession);
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    });
    expect(replaceState).toHaveBeenCalledWith(
      {},
      expect.any(String),
      "/sabro-desktop-call4me-pages/",
    );
  });
});
