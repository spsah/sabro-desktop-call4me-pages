import {
  fetchTenantDeals,
  TENANT_DEALS_PATH_PREFIX,
} from "./tenant-deals";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchTenantDeals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns deal rows on 200 with bearer Authorization", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        deals: [
          {
            id: "deal-1",
            name: "Acme renew",
            note: "Follow up",
            telephone: "+447700900123",
            stage: "Proposal",
          },
        ],
      }),
    );
    const rows = await fetchTenantDeals({
      clientId: "6402",
      accessToken: "seat-token",
      fetchImpl,
    });
    expect(rows).toEqual([
      {
        id: "deal-1",
        name: "Acme renew",
        note: "Follow up",
        telephone: "+447700900123",
        stage: "Proposal",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as unknown as [
      string,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe(`${TENANT_DEALS_PATH_PREFIX}?client_id=6402`);
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer seat-token",
    });
  });

  it.each([
    ["401", () => jsonResponse(401, { error: "unauthorized" })],
    ["403", () => jsonResponse(403, { error: "forbidden" })],
    ["404", () => jsonResponse(404, { error: "missing" })],
    ["500", () => jsonResponse(500, { error: "server" })],
    ["invalid JSON", () => new Response("not-json", { status: 200 })],
    ["empty object", () => jsonResponse(200, {})],
    ["bad row shape", () => jsonResponse(200, { deals: [{ id: 1 }] })],
  ] as const)("empty-safe: %s => []", async (_label, makeResponse) => {
    const fetchImpl = vi.fn(async () => makeResponse());
    await expect(
      fetchTenantDeals({
        clientId: "6402",
        accessToken: "tok",
        fetchImpl,
      }),
    ).resolves.toEqual([]);
  });

  it("empty-safe: network error => []", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      fetchTenantDeals({
        clientId: "6402",
        accessToken: "tok",
        fetchImpl,
      }),
    ).resolves.toEqual([]);
  });

  it("returns [] when accessToken or clientId missing", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchTenantDeals({ clientId: "6402", accessToken: "", fetchImpl }),
    ).resolves.toEqual([]);
    await expect(
      fetchTenantDeals({ clientId: "", accessToken: "tok", fetchImpl }),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});