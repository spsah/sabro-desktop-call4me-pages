import { describe, expect, it } from "vitest";
import {
  addContact,
  CALL4ME_CONTACTS_TABLE,
  type Call4MeContact,
  contactsStorageKey,
  createMemoryContactServer,
  createSupabaseContactStore,
  deleteContact,
  exportContactsCsv,
  filterContacts,
  hydrateContacts,
  importContacts,
  listContacts,
  parseContactFile,
  parseContactImport,
  updateContact,
} from "./contacts";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("Identity-synced Call4Me contacts", () => {
  it("round-trips principal A across two API backends and hides principal B", async () => {
    const { deviceA, deviceB } = createMemoryContactServer();
    const ada = await addContact(
      "principal-a",
      { name: "Ada Lovelace", telephone: "+447700900123" },
      deviceA,
      () => "contact-ada",
    );

    expect(ada).toEqual({
      id: "contact-ada",
      name: "Ada Lovelace",
      telephone: "+447700900123",
    });
    expect(await listContacts("principal-a", deviceB)).toEqual([ada]);
    expect(await listContacts("principal-b", deviceB)).toEqual([]);
    expect(contactsStorageKey("principal-a")).toBe(
      "sabro.call4me.contacts.v1:principal-a",
    );
  });

  it("round-trips principal A through two mocked Identity table clients", async () => {
    const server = new Map<string, Call4MeContact[]>();
    const deviceA = createSupabaseContactStore(mockSupabase(server));
    const deviceB = createSupabaseContactStore(mockSupabase(server));

    await addContact(
      "principal-a",
      { name: "Ada Lovelace", telephone: "+447700900123" },
      deviceA,
      () => "contact-ada",
    );

    expect(await listContacts("principal-a", deviceB)).toEqual([
      {
        id: "contact-ada",
        name: "Ada Lovelace",
        telephone: "+447700900123",
      },
    ]);
    expect(await listContacts("principal-b", deviceB)).toEqual([]);
  });

  it("migrates device-local rows once then stops writing localStorage as SoR", async () => {
    const storage = memoryStorage();
    storage.setItem(
      contactsStorageKey("principal-a"),
      JSON.stringify([
        {
          id: "legacy-ada",
          name: "Ada Lovelace",
          telephone: "+447700900123",
        },
      ]),
    );
    const { deviceA, deviceB } = createMemoryContactServer();
    const migrated = await hydrateContacts("principal-a", deviceA, storage);

    expect(migrated).toEqual([
      {
        id: "legacy-ada",
        name: "Ada Lovelace",
        telephone: "+447700900123",
      },
    ]);
    expect(await listContacts("principal-a", deviceB)).toEqual(migrated);
    expect(storage.getItem(contactsStorageKey("principal-a"))).toBeNull();

    await addContact(
      "principal-a",
      { name: "Bea", telephone: "07700900456" },
      deviceA,
      () => "contact-bea",
    );
    expect(storage.getItem(contactsStorageKey("principal-a"))).toBeNull();
    expect(await listContacts("principal-a", deviceB)).toHaveLength(2);
  });

  it("updates a contact name and telephone through the Identity store", async () => {
    const { deviceA, deviceB } = createMemoryContactServer();
    const ada = await addContact(
      "principal-a",
      { name: "Ada Lovelace", telephone: "+447700900123" },
      deviceA,
      () => "contact-ada",
    );

    const updated = await updateContact(
      "principal-a",
      ada.id,
      { name: "Ada Byron", telephone: "07747448677" },
      deviceA,
    );

    expect(updated).toEqual({
      id: "contact-ada",
      name: "Ada Byron",
      telephone: "07747448677",
    });
    expect(await listContacts("principal-a", deviceB)).toEqual([updated]);
    expect(await listContacts("principal-b", deviceB)).toEqual([]);
  });

  it("deletes a contact through the Identity store", async () => {
    const { deviceA, deviceB } = createMemoryContactServer();
    await addContact(
      "principal-a",
      { name: "Ada Lovelace", telephone: "+447700900123" },
      deviceA,
      () => "contact-ada",
    );
    await addContact(
      "principal-a",
      { name: "Bea", telephone: "07700900456" },
      deviceA,
      () => "contact-bea",
    );

    await deleteContact("principal-a", "contact-ada", deviceA);

    expect(await listContacts("principal-a", deviceB)).toEqual([
      { id: "contact-bea", name: "Bea", telephone: "07700900456" },
    ]);
    expect(await listContacts("principal-b", deviceB)).toEqual([]);
  });

  it("updates and deletes through two mocked Identity table clients", async () => {
    const server = new Map<string, Call4MeContact[]>();
    const deviceA = createSupabaseContactStore(mockSupabase(server));
    const deviceB = createSupabaseContactStore(mockSupabase(server));

    await addContact(
      "principal-a",
      { name: "Ada Lovelace", telephone: "+447700900123" },
      deviceA,
      () => "contact-ada",
    );
    await updateContact(
      "principal-a",
      "contact-ada",
      { name: "Ada Byron", telephone: "07747448677" },
      deviceA,
    );
    expect(await listContacts("principal-a", deviceB)).toEqual([
      {
        id: "contact-ada",
        name: "Ada Byron",
        telephone: "07747448677",
      },
    ]);

    await deleteContact("principal-a", "contact-ada", deviceA);
    expect(await listContacts("principal-a", deviceB)).toEqual([]);
  });

  it("does not write localStorage as SoR on update or delete", async () => {
    const storage = memoryStorage();
    const { deviceA } = createMemoryContactServer();
    const ada = await addContact(
      "principal-a",
      { name: "Ada Lovelace", telephone: "+447700900123" },
      deviceA,
      () => "contact-ada",
    );
    await updateContact(
      "principal-a",
      ada.id,
      { name: "Ada Byron", telephone: "07747448677" },
      deviceA,
    );
    await deleteContact("principal-a", ada.id, deviceA);
    expect(storage.getItem(contactsStorageKey("principal-a"))).toBeNull();
  });

  it("imports a CSV row with name and telephone", async () => {
    const rows = parseContactImport("name,telephone\nBea,+441932584132\n");
    expect(rows).toEqual([{ name: "Bea", telephone: "+441932584132" }]);

    const { deviceA, deviceB } = createMemoryContactServer();
    const imported = await importContacts(
      "tenant-1",
      rows,
      deviceA,
      () => "csv-1",
    );
    expect(imported).toEqual([
      { id: "csv-1", name: "Bea", telephone: "+441932584132" },
    ]);
    expect(await listContacts("tenant-1", deviceB)).toEqual(imported);
  });

  it("filters 120 imported contacts by name and by number", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      name: `Person ${String(index + 1).padStart(3, "0")}`,
      telephone: `+4477009${String(index + 1).padStart(5, "0")}`,
    }));
    rows[76] = { name: "Zara Ahmed", telephone: "+441932584132" };

    const { deviceA } = createMemoryContactServer();
    const imported = await importContacts("principal-a", rows, deviceA);
    expect(imported).toHaveLength(120);

    const listed = await listContacts("principal-a", deviceA);
    expect(filterContacts(listed, "Zara")).toEqual([
      expect.objectContaining({
        name: "Zara Ahmed",
        telephone: "+441932584132",
      }),
    ]);
    expect(filterContacts(listed, "1932584132")).toEqual([
      expect.objectContaining({
        name: "Zara Ahmed",
        telephone: "+441932584132",
      }),
    ]);
    expect(filterContacts(listed, "Person 001")).toEqual([
      expect.objectContaining({
        name: "Person 001",
        telephone: "+447700900001",
      }),
    ]);
    expect(filterContacts(listed, "7700900002")).toEqual([
      expect.objectContaining({
        name: "Person 002",
        telephone: "+447700900002",
      }),
    ]);
  });

  it("round-trips imported name and telephone through CSV export", async () => {
    const csv = "name,telephone\nAda Lovelace,+447700900123\nBea,07700900456\n";
    const { deviceA } = createMemoryContactServer();
    const imported = await importContacts(
      "principal-a",
      parseContactImport(csv),
      deviceA,
    );
    const listed = await listContacts("principal-a", deviceA);
    expect(listed.map(({ name, telephone }) => ({ name, telephone }))).toEqual(
      imported.map(({ name, telephone }) => ({ name, telephone })),
    );

    const exported = exportContactsCsv(listed);
    expect(parseContactImport(exported)).toEqual([
      { name: "Ada Lovelace", telephone: "+447700900123" },
      { name: "Bea", telephone: "07700900456" },
    ]);
  });

  it("imports an Excel workbook row without Twenty People API", async () => {
    const file = new File(
      [
        Uint8Array.from(
          buildXlsx([
            ["Name", "Telephone"],
            ["Cara", "07700900456"],
          ]),
        ),
      ],
      "people.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );
    const rows = await parseContactFile(file);
    expect(rows).toEqual([{ name: "Cara", telephone: "07700900456" }]);
  });
});

function mockSupabase(server: Map<string, Call4MeContact[]>) {
  return {
    from(table: string) {
      expect(table).toBe(CALL4ME_CONTACTS_TABLE);
      return {
        select() {
          return {
            eq(_column: string, principalId: string) {
              return {
                async order() {
                  return {
                    data: server.get(principalId) ?? [],
                    error: null,
                  };
                },
              };
            },
          };
        },
        delete() {
          return {
            async eq(_column: string, principalId: string) {
              server.set(principalId, []);
              return { error: null };
            },
          };
        },
        async insert(
          rows: Array<{
            id: string;
            principal_id: string;
            name: string;
            telephone: string;
          }>,
        ) {
          for (const row of rows) {
            const existing = server.get(row.principal_id) ?? [];
            server.set(row.principal_id, [
              ...existing,
              {
                id: row.id,
                name: row.name,
                telephone: row.telephone,
              },
            ]);
          }
          return { error: null };
        },
      };
    },
  };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStore(files: Record<string, string>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(body);
    const crc = crc32(data);
    const local = concat([
      new TextEncoder().encode("PK\u0003\u0004"),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    const central = concat([
      new TextEncoder().encode("PK\u0001\u0002"),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    new TextEncoder().encode("PK\u0005\u0006"),
    u16(0),
    u16(0),
    u16(centrals.length),
    u16(centrals.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}

function buildXlsx(rows: string[][]): Uint8Array {
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map(
            (value, col) =>
              `<c r="${String.fromCharCode(65 + col)}${rowIndex + 1}" t="inlineStr"><is><t>${value}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");
  return zipStore({
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  });
}
