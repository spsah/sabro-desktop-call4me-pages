import callFromDealSource from "../twenty-app/src/front-components/call-from-deal.front-component.tsx?raw";
import * as twentyOpenCall from "../twenty-app/src/open-call";
import twentyOpenCallSource from "../twenty-app/src/open-call.ts?raw";
import {
  buildCrmCall4MeUrl,
  CALL4ME_CHANNEL_NAME,
  CALL4ME_INTENT_KEY,
  CALL4ME_WINDOW_NAME,
  CALL4ME_WINDOW_REL,
  call4MeAnchorAttrs,
  createCall4MeDialRequestId,
  destinationFromOpportunityRecord,
  destinationFromSearch,
  fetchOpportunityDestination,
  handleOpenCallClick,
  isCall4MeSurfaceAlive,
  isCrmKeypadEntry,
  markCall4MeSurfaceAlive,
  type OpenCallAnchor,
  offerCall4MeIntent,
  openCall4MeTab,
  parseCall4MeLocation,
  stampCall4MeDialRequest,
  subscribeCall4MeIntent,
} from "./crm-open-call";

const dealId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const companyId = "44444444-4444-4444-8444-444444444444";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("CRM Open Call URL and keypad landing", () => {
  it.each([
    {
      label: "Twenty embed",
      input: { embeddedParam: "twenty", opportunityId: dealId },
      expected: true,
    },
    {
      label: "panel=keypad",
      input: { panel: "keypad" },
      expected: true,
    },
    {
      label: "destination query",
      input: { destination: "07747448677" },
      expected: true,
    },
    {
      label: "embedded prop with deal",
      input: { embeddedProp: true, opportunityId: dealId },
      expected: true,
    },
    {
      label: "shelf stays directory",
      input: { embeddedParam: "shelf", opportunityId: dealId },
      expected: false,
    },
    {
      label: "standalone contacts/phonebook default",
      input: { panel: "phonebook" },
      expected: false,
    },
    {
      label: "Twenty embed forces keypad over phonebook panel",
      input: {
        embeddedParam: "twenty",
        panel: "phonebook",
        opportunityId: dealId,
      },
      expected: true,
    },
  ])("$label → keypad=$expected", ({ input, expected }) => {
    expect(isCrmKeypadEntry(input)).toBe(expected);
  });

  it("reads destination from call-from-deal query keys", () => {
    expect(
      destinationFromSearch(
        new URLSearchParams("embedded=twenty&phone=%2B447747448677"),
      ),
    ).toBe("+447747448677");
    expect(
      destinationFromSearch(
        new URLSearchParams(`opportunityId=${dealId}&destination=07747448677`),
      ),
    ).toBe("07747448677");
  });

  it("builds a CRM Call4Me URL with a stable query and dest/deal in the hash", () => {
    const url = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07747448677",
    });
    expect(url.startsWith("/call4me/?")).toBe(true);
    const parsed = new URL(url, "https://app.sabro.cloud");
    expect(parsed.searchParams.get("embedded")).toBe("twenty");
    expect(parsed.searchParams.get("panel")).toBe("keypad");
    expect(parsed.searchParams.get("opportunityId")).toBeNull();
    expect(parsed.searchParams.get("destination")).toBeNull();
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    expect(hash.get("opportunityId")).toBe(dealId);
    expect(hash.get("destination")).toBe("07747448677");
    expect(hash.get("t")).toBeNull();
    expect(
      parseCall4MeLocation({ search: parsed.search, hash: parsed.hash }),
    ).toMatchObject({
      destination: "07747448677",
      opportunityId: dealId,
      panel: "keypad",
      embeddedParam: "twenty",
    });
  });

  it("keeps the Twenty Open Call URL contract identical to Call4Me entry", () => {
    const input = { opportunityId: dealId, destination: "07747448677" };
    expect(twentyOpenCall.buildCrmCall4MeUrl(input)).toBe(
      buildCrmCall4MeUrl(input),
    );
    expect(twentyOpenCall.CALL4ME_WINDOW_NAME).toBe(CALL4ME_WINDOW_NAME);
  });
});

describe("CRM Open Call named tab reuse", () => {
  function namedTabs() {
    const tabs: Array<{ name: string; href: string; navigations: number }> = [];
    const click = (anchor: OpenCallAnchor) => {
      const name = anchor.target ?? "";
      const href = anchor.getAttribute("href") ?? "";
      const existing = tabs.find((tab) => tab.name === name);
      if (existing) {
        existing.href = href;
        existing.navigations += 1;
        return;
      }
      tabs.push({ name, href, navigations: 1 });
    };
    return { tabs, click };
  }

  function withoutHtmlAnchorElement(run: () => void) {
    const globalObject = globalThis as typeof globalThis & {
      HTMLAnchorElement?: unknown;
    };
    const original = globalObject.HTMLAnchorElement;
    const hadOwn = Object.hasOwn(globalObject, "HTMLAnchorElement");
    Reflect.deleteProperty(globalObject, "HTMLAnchorElement");
    try {
      run();
    } finally {
      if (hadOwn) {
        globalObject.HTMLAnchorElement = original as typeof HTMLAnchorElement;
      }
    }
  }

  it("keeps query stable so named-target reuse is not keyed off dest/deal", () => {
    const firstUrl = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07711111111",
    });
    const secondUrl = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07722222222",
    });
    const first = new URL(firstUrl, "https://app.sabro.cloud");
    const second = new URL(secondUrl, "https://app.sabro.cloud");
    expect(first.search).toBe(second.search);
    expect(first.searchParams.get("destination")).toBeNull();
    expect(first.hash).not.toBe(second.hash);
  });

  it("reuses one named Call4Me surface via target=sabro-call4me, never _blank", () => {
    const firstUrl = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07711111111",
    });
    const secondUrl = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07722222222",
    });

    const first = call4MeAnchorAttrs(firstUrl);
    const second = call4MeAnchorAttrs(secondUrl);
    const twenty = twentyOpenCall.call4MeAnchorAttrs(
      buildCrmCall4MeUrl({ opportunityId: dealId }),
    );

    expect(first.target).toBe(CALL4ME_WINDOW_NAME);
    expect(second.target).toBe(CALL4ME_WINDOW_NAME);
    expect(twenty.target).toBe(CALL4ME_WINDOW_NAME);
    expect(first.target).toBe(second.target);
    expect([first.target, second.target, twenty.target]).not.toContain(
      "_blank",
    );
    expect(first.href).toBe(firstUrl);
    expect(second.href).toBe(secondUrl);
    expect(first.rel).toBe("opener");
    expect(first.rel).toBe(CALL4ME_WINDOW_REL);
    expect(twenty.rel).toBe(CALL4ME_WINDOW_REL);
    expect(first.rel).not.toMatch(/noopener|noreferrer/);
  });

  it("second Open Call with a different dest keeps tab count at 1 when Call4Me is alive", () => {
    const { tabs, click } = namedTabs();
    const storage = memoryStorage();
    const messages: unknown[] = [];
    const postMessage = (data: unknown) => {
      messages.push(data);
    };

    openCall4MeTab(
      buildCrmCall4MeUrl({
        opportunityId: dealId,
        destination: "07711111111",
      }),
      click,
      document,
      { storage, postMessage },
    );
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.navigations).toBe(1);

    markCall4MeSurfaceAlive(storage);
    expect(isCall4MeSurfaceAlive(storage)).toBe(true);

    openCall4MeTab(
      buildCrmCall4MeUrl({
        opportunityId: dealId,
        destination: "07722222222",
      }),
      click,
      document,
      { storage, postMessage },
    );
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.navigations).toBe(2);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      destination: "07722222222",
      opportunityId: dealId,
    });
    expect(
      new URLSearchParams(
        new URL(tabs[0]?.href ?? "", "https://x.test").hash.replace(/^#/, ""),
      ).get("t"),
    ).toBeTruthy();
  });

  it("named-target clicks with different hashes still reuse sabro-call4me", () => {
    const { tabs, click } = namedTabs();
    const storage = memoryStorage();
    const first = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07711111111",
    });
    const second = buildCrmCall4MeUrl({
      opportunityId: "55555555-5555-4555-8555-555555555555",
      destination: "07722222222",
    });
    openCall4MeTab(first, click, document, {
      storage,
      postMessage: () => undefined,
    });
    openCall4MeTab(second, click, document, {
      storage,
      postMessage: () => undefined,
    });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.navigations).toBe(2);
    expect(new URL(first, "https://x.test").search).toBe(
      new URL(second, "https://x.test").search,
    );
    expect(
      offerCall4MeIntent({ destination: "07722222222" }, { storage }),
    ).toBe(false);
  });

  it("stamps a unique hash t on each Open Call without putting dest in the query", () => {
    const url = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07747448677",
    });
    const first = stampCall4MeDialRequest(url, "reuse-1");
    const second = stampCall4MeDialRequest(url, "reuse-2");
    const firstParsed = new URL(first, "https://app.sabro.cloud");
    const secondParsed = new URL(second, "https://app.sabro.cloud");
    expect(firstParsed.search).toBe(secondParsed.search);
    expect(firstParsed.searchParams.get("destination")).toBeNull();
    expect(firstParsed.search).toBe(
      new URL(url, "https://app.sabro.cloud").search,
    );
    expect(firstParsed.hash).not.toBe(secondParsed.hash);
    expect(
      new URLSearchParams(firstParsed.hash.replace(/^#/, "")).get("t"),
    ).toBe("reuse-1");
    expect(
      new URLSearchParams(secondParsed.hash.replace(/^#/, "")).get("t"),
    ).toBe("reuse-2");
    expect(twentyOpenCall.stampCall4MeDialRequest(url, "reuse-1")).toBe(first);
  });

  it("handleOpenCallClick stamps t onto the named-target <a> href", () => {
    const storage = memoryStorage();
    const url = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07711111111",
    });
    const anchor = document.createElement("a");
    anchor.setAttribute("href", url);
    anchor.setAttribute("target", CALL4ME_WINDOW_NAME);
    const event = {
      preventDefault: () => undefined,
      currentTarget: anchor,
    };
    expect(
      handleOpenCallClick(
        event,
        { opportunityId: dealId, destination: "07711111111" },
        { storage, postMessage: () => undefined },
      ),
    ).toBe(false);
    const stamped = new URL(
      anchor.getAttribute("href") ?? "",
      "https://x.test",
    );
    expect(stamped.search).toBe(new URL(url, "https://x.test").search);
    expect(
      new URLSearchParams(stamped.hash.replace(/^#/, "")).get("destination"),
    ).toBe("07711111111");
    expect(
      new URLSearchParams(stamped.hash.replace(/^#/, "")).get("t"),
    ).toBeTruthy();
    expect(
      twentyOpenCall.handleOpenCallClick(
        {
          preventDefault: () => undefined,
          currentTarget: anchor,
        },
        { opportunityId: dealId, destination: "07711111111", t: "fc-t" },
        { storage, postMessage: () => undefined },
      ),
    ).toBe(false);
  });

  it("handleOpenCallClick never preventDefault, even when the Call4Me surface is alive", () => {
    const storage = memoryStorage();
    const prevented: boolean[] = [];
    const event = {
      preventDefault: () => {
        prevented.push(true);
      },
    };
    expect(
      handleOpenCallClick(
        event,
        { opportunityId: dealId, destination: "07711111111" },
        { storage, postMessage: () => undefined },
      ),
    ).toBe(false);
    expect(prevented).toHaveLength(0);

    markCall4MeSurfaceAlive(storage);
    expect(
      handleOpenCallClick(
        event,
        { opportunityId: dealId, destination: "07722222222" },
        { storage, postMessage: () => undefined },
      ),
    ).toBe(true);
    expect(prevented).toHaveLength(0);
    expect(
      twentyOpenCall.handleOpenCallClick(
        event,
        { opportunityId: dealId, destination: "07733333333" },
        { storage, postMessage: () => undefined },
      ),
    ).toBe(true);
    expect(prevented).toHaveLength(0);
  });

  it("Open Call stamps href and publishes when HTMLAnchorElement is undefined (Twenty FC sandbox)", () => {
    const storage = memoryStorage();
    const url = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07711111111",
    });
    const hrefBox = { href: url };
    const duck: OpenCallAnchor = {
      click: () => undefined,
      getAttribute: (name: string) => (name === "href" ? hrefBox.href : null),
      setAttribute: (name: string, value: string) => {
        if (name === "href") hrefBox.href = value;
      },
      target: CALL4ME_WINDOW_NAME,
      rel: CALL4ME_WINDOW_REL,
    };
    const messages: unknown[] = [];
    withoutHtmlAnchorElement(() => {
      expect(() => {
        handleOpenCallClick(
          { preventDefault: () => undefined, currentTarget: duck },
          { opportunityId: dealId, destination: "07711111111" },
          { storage, postMessage: (data) => messages.push(data) },
        );
      }).not.toThrow();
      expect(() => {
        twentyOpenCall.handleOpenCallClick(
          { preventDefault: () => undefined, currentTarget: duck },
          {
            opportunityId: dealId,
            destination: "07711111111",
            t: "sandbox-t",
          },
          { storage, postMessage: (data) => messages.push(data) },
        );
      }).not.toThrow();
      expect(() =>
        openCall4MeTab(url, () => undefined, document, {
          storage,
          postMessage: () => undefined,
        }),
      ).not.toThrow();
      expect(() =>
        twentyOpenCall.openCall4MeTab(url, () => undefined, document, {
          storage,
          postMessage: () => undefined,
        }),
      ).not.toThrow();
    });
    const stamped = new URL(hrefBox.href, "https://x.test");
    expect(
      new URLSearchParams(stamped.hash.replace(/^#/, "")).get("t"),
    ).toBeTruthy();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0]).toMatchObject({
      destination: "07711111111",
      opportunityId: dealId,
    });
  });

  it.each([
    {
      label: "window.open is undefined",
      install: () => {
        Object.defineProperty(window, "open", {
          configurable: true,
          value: undefined,
        });
      },
    },
    {
      label: "window.open throws TypeError",
      install: () => {
        Object.defineProperty(window, "open", {
          configurable: true,
          value: () => {
            throw new TypeError("window.open is not a function");
          },
        });
      },
    },
  ])(
    "Open Call does not throw when $label (Twenty FC sandbox)",
    ({ install }) => {
      const originalOpen = window.open;
      install();
      const openImpl = window.open;
      const url = buildCrmCall4MeUrl({
        opportunityId: dealId,
        destination: "07747448677",
      });
      const clicks: Array<{ href: string; target: string; rel: string }> = [];
      const click = (anchor: OpenCallAnchor) => {
        clicks.push({
          href: anchor.getAttribute("href") ?? "",
          target: anchor.target ?? "",
          rel: anchor.rel ?? "",
        });
      };

      try {
        const storage = memoryStorage();
        const postMessage = () => undefined;
        expect(() =>
          openCall4MeTab(url, click, document, { storage, postMessage }),
        ).not.toThrow();
        expect(() =>
          twentyOpenCall.openCall4MeTab(url, click, document, {
            storage,
            postMessage,
          }),
        ).not.toThrow();
        expect(clicks).toHaveLength(2);
        for (const clickPath of clicks) {
          const stamped = new URL(clickPath.href, "https://x.test");
          const original = new URL(url, "https://x.test");
          expect(stamped.search).toBe(original.search);
          expect(stamped.searchParams.get("destination")).toBeNull();
          expect(
            new URLSearchParams(stamped.hash.replace(/^#/, "")).get(
              "destination",
            ),
          ).toBe("07747448677");
          expect(
            new URLSearchParams(stamped.hash.replace(/^#/, "")).get("t"),
          ).toBeTruthy();
          expect(clickPath.target).toBe(CALL4ME_WINDOW_NAME);
          expect(clickPath.rel).toBe(CALL4ME_WINDOW_REL);
          expect(clickPath.rel).not.toMatch(/noopener|noreferrer/);
          expect(clickPath.target).not.toBe("_blank");
        }
        expect(window.open).toBe(openImpl);
      } finally {
        Object.defineProperty(window, "open", {
          configurable: true,
          value: originalOpen,
        });
      }
    },
  );
});

describe("opportunity phone extract", () => {
  it.each([
    {
      label: "pointOfContact phones metadata",
      record: {
        id: dealId,
        pointOfContact: {
          phones: {
            primaryPhoneCallingCode: "+44",
            primaryPhoneNumber: "7747448677",
          },
        },
      },
      expected: "+447747448677",
    },
    {
      label: "company additional phone",
      record: {
        company: {
          phones: {
            additionalPhones: [{ callingCode: "+44", number: "0800800800" }],
          },
        },
      },
      expected: "+44800800800",
    },
    {
      label: "direct telephone field",
      record: { telephone: "07747448677" },
      expected: "07747448677",
    },
    {
      label: "E.164 already in primaryPhoneNumber",
      record: {
        phones: { primaryPhoneNumber: "+447747448677" },
      },
      expected: "+447747448677",
    },
  ])("$label", ({ record, expected }) => {
    expect(destinationFromOpportunityRecord(record)).toBe(expected);
    expect(twentyOpenCall.destinationFromOpportunityRecord(record)).toBe(
      expected,
    );
  });

  it("does not treat opportunity amount as a phone", () => {
    expect(
      destinationFromOpportunityRecord({
        amount: { amountMicros: 5000000, currencyCode: "GBP" },
      }),
    ).toBeUndefined();
  });

  it("fetches person phone when the opportunity itself has none", async () => {
    const fetcher = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/rest/opportunities/")) {
        return {
          ok: true,
          json: async () => ({
            data: { opportunity: { id: dealId, pointOfContactId: personId } },
          }),
        };
      }
      if (url.includes("/rest/people/")) {
        return {
          ok: true,
          json: async () => ({
            person: {
              id: personId,
              phones: {
                primaryPhoneCallingCode: "+44",
                primaryPhoneNumber: "7747448677",
              },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    await expect(
      fetchOpportunityDestination(dealId, fetcher as unknown as typeof fetch),
    ).resolves.toBe("+447747448677");
    expect(fetcher).toHaveBeenCalledWith(
      `/rest/people/${personId}?depth=1`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("fetches company phone when person is missing", async () => {
    const fetcher = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/rest/opportunities/")) {
        return {
          ok: true,
          json: async () => ({
            id: dealId,
            companyId,
          }),
        };
      }
      if (url.includes("/rest/companies/")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              company: { phones: { primaryPhoneNumber: "0800800150" } },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    await expect(
      fetchOpportunityDestination(dealId, fetcher as unknown as typeof fetch),
    ).resolves.toBe("0800800150");
  });
});

describe("Twenty call-from-deal Open Call lock", () => {
  it("opens a named-target <a> instead of window.open, _blank, or an iframe", () => {
    expect(callFromDealSource).toContain("Open Call");
    expect(callFromDealSource).toContain("buildCrmCall4MeUrl");
    expect(callFromDealSource).toMatch(/<a\b/);
    expect(callFromDealSource).toMatch(
      /target=\{CALL4ME_WINDOW_NAME\}|target=["']sabro-call4me["']/,
    );
    expect(callFromDealSource).toMatch(
      /rel=["']opener["']|rel=\{CALL4ME_WINDOW_REL\}/,
    );
    expect(callFromDealSource).toContain("handleOpenCallClick");
    expect(callFromDealSource).not.toMatch(/noopener noreferrer/);
    expect(callFromDealSource).not.toContain("window.open");
    expect(callFromDealSource).not.toContain("openCall4MeTab");
    expect(callFromDealSource).not.toMatch(/<button\b/);
    expect(callFromDealSource).not.toMatch(/target=["']_blank["']/);
    expect(callFromDealSource).not.toMatch(/<iframe/i);
    expect(callFromDealSource).not.toContain("HTMLAnchorElement");
    expect(twentyOpenCallSource).toContain(CALL4ME_WINDOW_NAME);
    expect(twentyOpenCallSource).not.toContain("window.open");
    expect(twentyOpenCallSource).not.toContain("_blank");
    expect(twentyOpenCallSource).not.toContain("HTMLAnchorElement");
    expect(twentyOpenCallSource).toContain('CALL4ME_WINDOW_REL = "opener"');
    expect(twentyOpenCallSource).not.toMatch(/WINDOW_REL = "noopener/);
    expect(twentyOpenCallSource).toContain('createElement("a")');
  });
});

describe("CRM Open Call reuse delivers auto-dial intent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/index.html");
  });

  it("subscribeCall4MeIntent delivers storage reuse without hashchange", () => {
    const received: Array<{ destination?: string; t?: string }> = [];
    const stop = subscribeCall4MeIntent((intent) => received.push(intent));
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: CALL4ME_INTENT_KEY,
          newValue: JSON.stringify({
            destination: "07722222222",
            opportunityId: dealId,
            panel: "keypad",
            t: "storage-reuse-1",
          }),
        }),
      );
      expect(received).toEqual([
        expect.objectContaining({
          destination: "07722222222",
          t: "storage-reuse-1",
        }),
      ]);
    } finally {
      stop();
    }
  });

  it("subscribeCall4MeIntent re-reads stamped hash on focus when hashchange is missing", () => {
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111`,
    );
    const received: Array<{ destination?: string; t?: string }> = [];
    const stop = subscribeCall4MeIntent((intent) => received.push(intent));
    try {
      window.history.replaceState(
        {},
        "",
        `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07733333333&t=focus-reuse-1`,
      );
      window.dispatchEvent(new Event("focus"));
      expect(received).toEqual([
        expect.objectContaining({
          destination: "07733333333",
          t: "focus-reuse-1",
        }),
      ]);
    } finally {
      stop();
      window.history.replaceState({}, "", "/index.html");
    }
  });

  it("BroadcastChannel sabro-call4me delivers a new t so the same dest can auto-dial again", async () => {
    const received: Array<{ destination?: string; t?: string }> = [];
    const stop = subscribeCall4MeIntent((intent) => received.push(intent));
    const channel = new BroadcastChannel(CALL4ME_CHANNEL_NAME);
    try {
      channel.postMessage({
        destination: "07711111111",
        opportunityId: dealId,
        panel: "keypad",
        t: "channel-reuse-1",
      });
      await vi.waitFor(() => {
        expect(received).toEqual([
          expect.objectContaining({
            destination: "07711111111",
            t: "channel-reuse-1",
          }),
        ]);
      });
      channel.postMessage({
        destination: "07711111111",
        opportunityId: dealId,
        panel: "keypad",
        t: "channel-reuse-2",
      });
      await vi.waitFor(() => {
        expect(received).toHaveLength(2);
      });
      expect(received[1]).toMatchObject({ t: "channel-reuse-2" });
    } finally {
      channel.close();
      stop();
    }
  });

  it("focus delivers a newer hash t even when stored intent still has the old t", () => {
    window.localStorage.setItem(
      CALL4ME_INTENT_KEY,
      JSON.stringify({
        destination: "07711111111",
        opportunityId: dealId,
        panel: "keypad",
        t: "stale-t",
      }),
    );
    window.history.replaceState(
      {},
      "",
      `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111&t=stale-t`,
    );
    const received: Array<{ destination?: string; t?: string }> = [];
    const stop = subscribeCall4MeIntent((intent) => received.push(intent));
    try {
      window.history.replaceState(
        {},
        "",
        `/index.html?embedded=twenty&panel=keypad#opportunityId=${dealId}&destination=07711111111&t=fresh-reuse-t`,
      );
      window.dispatchEvent(new Event("focus"));
      expect(received).toEqual([
        expect.objectContaining({
          destination: "07711111111",
          t: "fresh-reuse-t",
        }),
      ]);
    } finally {
      stop();
      window.history.replaceState({}, "", "/index.html");
    }
  });

  it("alive Open Call click stamps a new t so reuse can auto-dial the same dest", () => {
    const storage = memoryStorage();
    markCall4MeSurfaceAlive(storage);
    const url = buildCrmCall4MeUrl({
      opportunityId: dealId,
      destination: "07711111111",
    });
    const first = document.createElement("a");
    first.setAttribute("href", url);
    first.setAttribute("target", CALL4ME_WINDOW_NAME);
    const second = document.createElement("a");
    second.setAttribute("href", url);
    second.setAttribute("target", CALL4ME_WINDOW_NAME);
    const firstPrevented: boolean[] = [];
    const secondPrevented: boolean[] = [];
    handleOpenCallClick(
      {
        preventDefault: () => {
          firstPrevented.push(true);
        },
        currentTarget: first,
      },
      { opportunityId: dealId, destination: "07711111111", t: "reuse-1" },
      { storage, postMessage: () => undefined },
    );
    handleOpenCallClick(
      {
        preventDefault: () => {
          secondPrevented.push(true);
        },
        currentTarget: second,
      },
      { opportunityId: dealId, destination: "07711111111", t: "reuse-2" },
      { storage, postMessage: () => undefined },
    );
    expect(firstPrevented).toHaveLength(0);
    expect(secondPrevented).toHaveLength(0);
    const firstT = new URLSearchParams(
      new URL(first.getAttribute("href") ?? "", "https://x.test").hash.replace(
        /^#/,
        "",
      ),
    ).get("t");
    const secondT = new URLSearchParams(
      new URL(second.getAttribute("href") ?? "", "https://x.test").hash.replace(
        /^#/,
        "",
      ),
    ).get("t");
    expect(firstT).toBe("reuse-1");
    expect(secondT).toBe("reuse-2");
    expect(firstT).not.toBe(secondT);
  });

  it("createCall4MeDialRequestId is unique per Open Call click", () => {
    expect(createCall4MeDialRequestId()).not.toBe(createCall4MeDialRequestId());
    expect(twentyOpenCall.createCall4MeDialRequestId()).toMatch(
      /^[a-z0-9-]+$/i,
    );
  });
});
