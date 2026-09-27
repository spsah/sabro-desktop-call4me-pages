export type Call4MeContact = {
  id: string;
  name: string;
  telephone: string;
};

export type ContactDraft = {
  name: string;
  telephone: string;
};

export type ContactStore = {
  list(principalId: string): Promise<Call4MeContact[]>;
  save(principalId: string, contacts: Call4MeContact[]): Promise<void>;
};

export type ContactApiRequest = {
  method: "GET" | "PUT";
  principalId: string;
  contacts?: Call4MeContact[];
};

export const CONTACTS_STORAGE_PREFIX = "sabro.call4me.contacts.v1:";
export const CALL4ME_CONTACTS_TABLE = "call4me_contacts";

export function contactsStorageKey(principalId: string): string {
  return `${CONTACTS_STORAGE_PREFIX}${principalId}`;
}

export function createContactApiStore(
  request: (input: ContactApiRequest) => Promise<Call4MeContact[]>,
): ContactStore {
  return {
    async list(principalId) {
      return request({ method: "GET", principalId });
    },
    async save(principalId, contacts) {
      await request({ method: "PUT", principalId, contacts });
    },
  };
}

export function createMemoryContactServer(): {
  deviceA: ContactStore;
  deviceB: ContactStore;
} {
  const records = new Map<string, Call4MeContact[]>();
  const handle = async (
    input: ContactApiRequest,
  ): Promise<Call4MeContact[]> => {
    if (input.method === "PUT") {
      records.set(
        input.principalId,
        (input.contacts ?? []).map((contact) => ({ ...contact })),
      );
    }
    return (records.get(input.principalId) ?? []).map((contact) => ({
      ...contact,
    }));
  };
  return {
    deviceA: createContactApiStore(handle),
    deviceB: createContactApiStore(handle),
  };
}

export function createMemoryContactStore(
  records: Map<string, Call4MeContact[]> = new Map(),
): ContactStore {
  return createContactApiStore(async (input) => {
    if (input.method === "PUT") {
      records.set(
        input.principalId,
        (input.contacts ?? []).map((contact) => ({ ...contact })),
      );
    }
    return (records.get(input.principalId) ?? []).map((contact) => ({
      ...contact,
    }));
  });
}

type SupabaseContactClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => PromiseLike<{
          data: Array<{
            id?: unknown;
            name?: unknown;
            telephone?: unknown;
          }> | null;
          error: { message: string } | null;
        }>;
      };
    };
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
    insert: (
      rows: Array<{
        id: string;
        principal_id: string;
        name: string;
        telephone: string;
      }>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export function createSupabaseContactStore(
  client: SupabaseContactClient,
): ContactStore {
  return {
    async list(principalId) {
      const { data, error } = await client
        .from(CALL4ME_CONTACTS_TABLE)
        .select("id,name,telephone")
        .eq("principal_id", principalId)
        .order("created_at", { ascending: true });
      if (error) throw new Error("Could not load contacts.");
      return readStoredContacts(JSON.stringify(data ?? []));
    },
    async save(principalId, contacts) {
      const { error: deleteError } = await client
        .from(CALL4ME_CONTACTS_TABLE)
        .delete()
        .eq("principal_id", principalId);
      if (deleteError) throw new Error("Could not save contacts.");
      if (!contacts.length) return;
      const { error } = await client.from(CALL4ME_CONTACTS_TABLE).insert(
        contacts.map((contact) => ({
          id: contact.id,
          principal_id: principalId,
          name: contact.name,
          telephone: contact.telephone,
        })),
      );
      if (error) throw new Error("Could not save contacts.");
    },
  };
}

function newContactId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function telephoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function filterContacts(
  contacts: Call4MeContact[],
  query: string,
): Call4MeContact[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return contacts;
  const needleDigits = telephoneDigits(query);
  const searchingNumber = needleDigits.length > 0 && !/[a-z]/i.test(query);
  return contacts.filter((contact) => {
    if (contact.name.toLowerCase().includes(needle)) return true;
    if (contact.telephone.toLowerCase().includes(needle)) return true;
    return (
      searchingNumber &&
      telephoneDigits(contact.telephone).includes(needleDigits)
    );
  });
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportContactsCsv(contacts: Call4MeContact[]): string {
  const lines = ["name,telephone"];
  for (const contact of contacts) {
    lines.push(`${csvEscape(contact.name)},${csvEscape(contact.telephone)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function isDialableTelephone(value: string): boolean {
  return telephoneDigits(value).length >= 3;
}

export function normalizeContactDraft(
  input: ContactDraft,
): ContactDraft | null {
  const name = input.name.trim();
  const telephone = input.telephone.trim();
  if (!name || !isDialableTelephone(telephone)) return null;
  return { name, telephone };
}

function readStoredContacts(raw: string): Call4MeContact[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const record = row as Record<string, unknown>;
      const draft = normalizeContactDraft({
        name: typeof record.name === "string" ? record.name : "",
        telephone:
          typeof record.telephone === "string"
            ? record.telephone
            : typeof record.telephone === "number" &&
                Number.isFinite(record.telephone)
              ? String(record.telephone)
              : "",
      });
      if (!draft) return [];
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : newContactId();
      return [{ id, ...draft }];
    });
  } catch {
    return [];
  }
}

export function loadLocalContacts(
  principalId: string,
  storage: Storage,
): Call4MeContact[] {
  if (!principalId.trim()) return [];
  const raw = storage.getItem(contactsStorageKey(principalId));
  return raw ? readStoredContacts(raw) : [];
}

export async function listContacts(
  principalId: string,
  store: ContactStore,
): Promise<Call4MeContact[]> {
  if (!principalId.trim()) return [];
  return store.list(principalId);
}

export async function addContact(
  principalId: string,
  input: ContactDraft,
  store: ContactStore,
  idFactory: () => string = newContactId,
): Promise<Call4MeContact> {
  const draft = normalizeContactDraft(input);
  if (!draft) throw new Error("Enter a name and telephone.");
  const contact: Call4MeContact = { id: idFactory(), ...draft };
  const existing = await listContacts(principalId, store);
  await store.save(principalId, [...existing, contact]);
  return contact;
}

export async function updateContact(
  principalId: string,
  id: string,
  input: ContactDraft,
  store: ContactStore,
): Promise<Call4MeContact> {
  const draft = normalizeContactDraft(input);
  if (!draft) throw new Error("Enter a name and telephone.");
  const existing = await listContacts(principalId, store);
  if (!existing.some((contact) => contact.id === id)) {
    throw new Error("Contact was not found.");
  }
  const contact: Call4MeContact = { id, ...draft };
  await store.save(
    principalId,
    existing.map((row) => (row.id === id ? contact : row)),
  );
  return contact;
}

export async function deleteContact(
  principalId: string,
  id: string,
  store: ContactStore,
): Promise<void> {
  const existing = await listContacts(principalId, store);
  await store.save(
    principalId,
    existing.filter((contact) => contact.id !== id),
  );
}

export async function importContacts(
  principalId: string,
  rows: ContactDraft[],
  store: ContactStore,
  idFactory: () => string = newContactId,
): Promise<Call4MeContact[]> {
  const existing = await listContacts(principalId, store);
  const imported: Call4MeContact[] = [];
  for (const row of rows) {
    const draft = normalizeContactDraft(row);
    if (!draft) continue;
    const seen = existing
      .concat(imported)
      .some(
        (contact) =>
          contact.name === draft.name &&
          telephoneDigits(contact.telephone) ===
            telephoneDigits(draft.telephone),
      );
    if (seen) continue;
    imported.push({ id: idFactory(), ...draft });
  }
  if (imported.length) {
    await store.save(principalId, [...existing, ...imported]);
  }
  return imported;
}

export async function hydrateContacts(
  principalId: string,
  store: ContactStore,
  storage: Storage,
): Promise<Call4MeContact[]> {
  const remote = await listContacts(principalId, store);
  const local = loadLocalContacts(principalId, storage);
  storage.removeItem(contactsStorageKey(principalId));
  if (remote.length) return remote;
  if (!local.length) return [];
  await store.save(principalId, local);
  return local;
}

function detectDelimiter(line: string): string {
  const commas = (line.match(/,/g) ?? []).length;
  const semicolons = (line.match(/;/g) ?? []).length;
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs > commas && tabs > semicolons) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function parseDelimited(text: string): string[][] {
  const source = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const delimiter = detectDelimiter(source.split("\n")[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function draftsFromGrid(grid: string[][]): ContactDraft[] {
  if (grid.length === 0) return [];
  let start = 0;
  let nameIndex = 0;
  let telephoneIndex = 1;
  const header = (grid[0] ?? []).map((cell) => cell.trim());
  const named = header.findIndex((cell) =>
    /^(name|contact|full name)$/i.test(cell),
  );
  const phoned = header.findIndex((cell) =>
    /^(telephone|phone|mobile|number|tel)$/i.test(cell),
  );
  if (named >= 0 && phoned >= 0) {
    nameIndex = named;
    telephoneIndex = phoned;
    start = 1;
  }
  const drafts: ContactDraft[] = [];
  for (const row of grid.slice(start)) {
    const name = (row[nameIndex] ?? "").trim();
    const telephone = (row[telephoneIndex] ?? "").trim();
    if (normalizeContactDraft({ name, telephone })) {
      drafts.push({ name, telephone });
    }
  }
  return drafts;
}

export function parseContactImport(text: string): ContactDraft[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/<worksheet[\s>]|<Workbook[\s>]/i.test(trimmed)) {
    return draftsFromGrid(gridFromSpreadsheetXml(trimmed));
  }
  return draftsFromGrid(parseDelimited(text));
}

function textContent(node: Element | null): string {
  return (node?.textContent ?? "").trim();
}

function gridFromSpreadsheetXml(xml: string): string[][] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const worksheetRows = [...doc.getElementsByTagNameNS("*", "row")];
  if (
    worksheetRows.length > 0 &&
    worksheetRows[0]?.getElementsByTagNameNS("*", "c").length
  ) {
    return worksheetRows.map((row) => {
      const cells = [...row.getElementsByTagNameNS("*", "c")];
      return cells.map((cell) => {
        const inline = cell.getElementsByTagNameNS("*", "t")[0];
        if (inline) return textContent(inline);
        return textContent(cell.getElementsByTagNameNS("*", "v")[0] ?? cell);
      });
    });
  }
  return [...doc.getElementsByTagNameNS("*", "Row")].map((row) =>
    [...row.getElementsByTagNameNS("*", "Cell")].map((cell) =>
      textContent(cell.getElementsByTagNameNS("*", "Data")[0] ?? cell),
    ),
  );
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Could not read that file.");
  }
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const stream = new Blob([copy])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipTextFiles(bytes: Uint8Array): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(
      bytes.subarray(nameStart, nameStart + nameLength),
    );
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const raw = method === 8 ? await inflateRaw(compressed) : compressed;
    if (method !== 0 && method !== 8) {
      throw new Error("Could not read that file.");
    }
    files.set(name.replace(/^\//, ""), decoder.decode(raw));
    offset = dataStart + compressedSize;
  }
  return files;
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function readFileBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseContactFile(
  file: Blob & { name?: string },
): Promise<ContactDraft[]> {
  const bytes = await readFileBytes(file);
  const fileName = file.name ?? "";
  if (looksLikeZip(bytes) || /\.xlsx$/i.test(fileName)) {
    const files = await unzipTextFiles(bytes);
    const shared = files.get("xl/sharedStrings.xml");
    const strings = shared
      ? [
          ...new DOMParser()
            .parseFromString(shared, "text/xml")
            .getElementsByTagNameNS("*", "si"),
        ].map((item) => textContent(item))
      : [];
    const sheet =
      [...files.entries()].find(([name]) =>
        /worksheets\/sheet\d+\.xml$/i.test(name),
      )?.[1] ?? "";
    if (!sheet) throw new Error("Could not read that file.");
    const grid = gridFromSpreadsheetXml(sheet).map((row) =>
      row.map((cell) => {
        if (/^\d+$/.test(cell) && strings[Number(cell)]) {
          return strings[Number(cell)] ?? cell;
        }
        return cell;
      }),
    );
    const drafts = draftsFromGrid(grid);
    if (drafts.length) return drafts;
  }
  return parseContactImport(new TextDecoder().decode(bytes));
}
