import {
  clearTenantMapCache,
  resolveTenantViaBridge,
  TENANT_MAP_PATH_PREFIX,
} from "./tenant-map";

const SYNTHETIC_TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_TENANT_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

const productionSources = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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

describe("resolveTenantViaBridge", () => {
  afterEach(() => {
    clearTenantMapCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("maps on 200 with matching client_id and uuid tenant_id from the response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    const result = await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "seat-a-token",
      fetchImpl,
    });
    expect(result).toEqual({ state: "mapped", tenantId: SYNTHETIC_TENANT_ID });
    expect(result.state === "mapped" && result.tenantId).toBe(SYNTHETIC_TENANT_ID);
  });

  it.each([
    ["401", () => jsonResponse(401, { error: "unauthorized" })],
    ["403", () => jsonResponse(403, { error: "forbidden" })],
    ["404", () => jsonResponse(404, { error: "not found" })],
    ["500", () => jsonResponse(500, { error: "server" })],
    ["invalid JSON", () => new Response("not-json", { status: 200 })],
    [
      "wrong client_id",
      () => jsonResponse(200, { client_id: 6403, tenant_id: SYNTHETIC_TENANT_ID }),
    ],
    [
      "non-uuid tenant_id",
      () => jsonResponse(200, { client_id: 6402, tenant_id: "not-a-uuid" }),
    ],
    ["missing tenant_id", () => jsonResponse(200, { client_id: 6402 })],
    ["missing client_id", () => jsonResponse(200, { tenant_id: SYNTHETIC_TENANT_ID })],
    ["string client_id", () => jsonResponse(200, { client_id: "6402", tenant_id: SYNTHETIC_TENANT_ID })],
  ] as const)("fail-closed: %s => unmapped, no throw", async (_label, makeResponse) => {
    const fetchImpl = vi.fn(async () => makeResponse());
    await expect(
      resolveTenantViaBridge({
        clientId: "6402",
        accessToken: "tok",
        fetchImpl,
      }),
    ).resolves.toEqual({ state: "unmapped" });
  });

  it("fail-closed: network error => unmapped, no throw", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      resolveTenantViaBridge({
        clientId: "6402",
        accessToken: "tok",
        fetchImpl,
      }),
    ).resolves.toEqual({ state: "unmapped" });
  });

  it("fail-closed: timeout (8s) => unmapped, no throw", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    const pending = resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "tok",
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toEqual({ state: "unmapped" });
  });

  it("uses same-origin relative URL under /sabro-auth/ with Bearer and cache no-store", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID }),
    );
    await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "identity-access",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchCall(fetchImpl);
    expect(typeof url).toBe("string");
    expect(String(url).startsWith(TENANT_MAP_PATH_PREFIX)).toBe(true);
    expect(String(url).startsWith("/sabro-auth/")).toBe(true);
    expect(String(url)).toBe("/sabro-auth/tenant-map?client_id=6402");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer identity-access" });
    expect(init?.cache).toBe("no-store");
    expect(init).not.toHaveProperty("credentials");
  });

  it("caches one attempt per clientId + access-token identity (two seats never cross-bind)", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === "Bearer seat-a") {
        return jsonResponse(200, { client_id: 6402, tenant_id: SYNTHETIC_TENANT_ID });
      }
      return jsonResponse(200, { client_id: 6402, tenant_id: OTHER_TENANT_ID });
    });

    const a1 = await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "seat-a",
      fetchImpl,
    });
    const a2 = await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "seat-a",
      fetchImpl,
    });
    const b1 = await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "seat-b",
      fetchImpl,
    });

    expect(a1).toEqual({ state: "mapped", tenantId: SYNTHETIC_TENANT_ID });
    expect(a2).toEqual({ state: "mapped", tenantId: SYNTHETIC_TENANT_ID });
    expect(b1).toEqual({ state: "mapped", tenantId: OTHER_TENANT_ID });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry in a loop after a fail-closed result", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
    const first = await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "tok",
      fetchImpl,
    });
    const second = await resolveTenantViaBridge({
      clientId: "6402",
      accessToken: "tok",
      fetchImpl,
    });
    expect(first).toEqual({ state: "unmapped" });
    expect(second).toEqual({ state: "unmapped" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("src/ has no hardcoded UUID literals (excluding tests)", () => {
  it("greps production src for UUID-shaped string literals", () => {
    const uuidRe =
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
    const offenders = Object.entries(productionSources)
      .filter(([path]) => !/\.test\.(ts|tsx)$/.test(path))
      .filter(([, text]) => uuidRe.test(text))
      .map(([path]) => path.replace(/^\.\//, ""));
    expect(offenders).toEqual([]);
  });
});
