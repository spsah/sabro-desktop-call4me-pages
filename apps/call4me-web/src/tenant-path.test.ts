import {
  DEFAULT_TENANT_SURFACE,
  STAGE0_CLIENT_IDS,
  evaluateTenantAccess,
  parseTenantPath,
  resolveDefaultTenantPath,
} from "./tenant-path";

describe("parseTenantPath", () => {
  it("parses a valid /c/:clientId/:surface path", () => {
    expect(parseTenantPath("/c/6402/pipeline")).toEqual({
      clientId: "6402",
      surface: "pipeline",
    });
  });

  it("parses deals, insights, and call4me surfaces", () => {
    expect(parseTenantPath("/c/6401/deals")?.surface).toBe("deals");
    expect(parseTenantPath("/c/6400/insights")?.surface).toBe("insights");
    expect(parseTenantPath("/c/6403/call4me")?.surface).toBe("call4me");
  });

  it("treats /c/:clientId and /c/:clientId/ as root (default-redirect target)", () => {
    expect(parseTenantPath("/c/6402")).toEqual({ clientId: "6402", surface: "root" });
    expect(parseTenantPath("/c/6402/")).toEqual({ clientId: "6402", surface: "root" });
  });

  it("rejects non-4-digit client ids (3-digit, 5-digit, leading-zero junk)", () => {
    expect(parseTenantPath("/c/640/pipeline")).toBeNull();
    expect(parseTenantPath("/c/64002/pipeline")).toBeNull();
    expect(parseTenantPath("/c/0640/pipeline")).toBeNull();
  });

  it("rejects path traversal segments", () => {
    expect(parseTenantPath("/c/6402/../6403/pipeline")).toBeNull();
    expect(parseTenantPath("/c/../6402/pipeline")).toBeNull();
    expect(parseTenantPath("/c/6402/foo/../pipeline")).toBeNull();
  });

  it("rejects percent-encoded junk in the path", () => {
    expect(parseTenantPath("/c/%36%34%30%32/pipeline")).toBeNull();
    expect(parseTenantPath("/c/6402/%70ipeline")).toBeNull();
  });

  it("rejects paths that are not under /c/", () => {
    expect(parseTenantPath("/pipeline")).toBeNull();
    expect(parseTenantPath("/c")).toBeNull();
    expect(parseTenantPath("/c/")).toBeNull();
  });

  it("marks unknown surfaces under a valid client as not-found candidates", () => {
    expect(parseTenantPath("/c/6402/contacts")).toEqual({
      clientId: "6402",
      surface: "not-found",
    });
    expect(parseTenantPath("/c/6402/pipeline/extra")).toEqual({
      clientId: "6402",
      surface: "not-found",
    });
  });
});

describe("STAGE0 registry + evaluateTenantAccess", () => {
  const allowed6402 = {
    app_metadata: { client_ids: [6402] },
  };

  it("documents the ratified Stage-0 client id set", () => {
    expect([...STAGE0_CLIENT_IDS]).toEqual([6400, 6401, 6402, 6403]);
  });

  it("allows a known Stage-0 client when the seat allow-set includes it", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6402/pipeline",
      identity: allowed6402,
    });
    expect(result).toEqual({
      ok: true,
      clientId: "6402",
      surface: "pipeline",
      tenant: { state: "unmapped" },
    });
  });

  it("denies unknown registry ids with 403 (e.g. 9999)", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/9999/pipeline",
      identity: { app_metadata: { client_ids: [9999] } },
    });
    expect(result).toMatchObject({ ok: false, status: 403, reason: expect.any(String) });
  });

  it("denies 3-digit client segments before registry (parse fail -> 404)", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/640/pipeline",
      identity: allowed6402,
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("accepts string client_ids entries that match the path clientId", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6402/deals",
      identity: { app_metadata: { client_ids: ["6402", "6401"] } },
    });
    expect(result).toMatchObject({ ok: true, clientId: "6402", surface: "deals" });
  });

  it("denies when app_metadata.client_ids is missing", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6402/pipeline",
      identity: { app_metadata: { principal_id: "11111111-1111-4111-8111-111111111111" } },
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("denies when app_metadata.client_ids is empty", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6402/pipeline",
      identity: { app_metadata: { client_ids: [] } },
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("denies when the seat is allowed for a different client (cross-path)", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6403/pipeline",
      identity: { app_metadata: { client_ids: [6402] } },
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("denies malformed client_ids claims (fail closed)", () => {
    expect(
      evaluateTenantAccess({
        pathname: "/c/6402/pipeline",
        identity: { app_metadata: { client_ids: "6402" } },
      }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      evaluateTenantAccess({
        pathname: "/c/6402/pipeline",
        identity: { app_metadata: { client_ids: [null, { id: 6402 }] } },
      }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("returns 401 when unauthenticated (no identity)", () => {
    expect(
      evaluateTenantAccess({ pathname: "/c/6402/pipeline", identity: null }),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("returns ok with tenant.state unmapped when lookup yields nothing (default map)", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6402/insights",
      identity: allowed6402,
    });
    expect(result).toEqual({
      ok: true,
      clientId: "6402",
      surface: "insights",
      tenant: { state: "unmapped" },
    });
  });

  it("returns mapped only when an injectable lookup supplies a tenant id", () => {
    const result = evaluateTenantAccess({
      pathname: "/c/6402/pipeline",
      identity: allowed6402,
      lookupTenant: (clientId) =>
        clientId === "6402" ? "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" : null,
    });
    expect(result).toEqual({
      ok: true,
      clientId: "6402",
      surface: "pipeline",
      tenant: { state: "mapped", tenantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    });
  });

  it("returns 404 for unknown surfaces under a known allowed client", () => {
    expect(
      evaluateTenantAccess({
        pathname: "/c/6402/contacts",
        identity: allowed6402,
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("exposes pipeline as the default-redirect target for root paths", () => {
    expect(DEFAULT_TENANT_SURFACE).toBe("pipeline");
    expect(resolveDefaultTenantPath("6402")).toBe("/c/6402/pipeline");
    const root = evaluateTenantAccess({
      pathname: "/c/6402/",
      identity: allowed6402,
    });
    expect(root).toMatchObject({
      ok: true,
      clientId: "6402",
      surface: "root",
      tenant: { state: "unmapped" },
    });
  });
});
