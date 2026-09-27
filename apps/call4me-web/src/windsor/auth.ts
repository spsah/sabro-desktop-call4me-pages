import type { WindsorAuth } from "./policy";

export const WINDSOR_TOKEN_STORAGE_KEY = "sabro.windsor.oauth.tokens.v1";
export const WINDSOR_PENDING_STORAGE_KEY = "sabro.windsor.oauth.pending.v1";

export type WindsorPersistedTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
};

export type WindsorOAuthPending = {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
};

export type WindsorTokenStore = {
  load(): string | null;
  save(value: string): void;
  clear(): void;
};

function memoryStore(): WindsorTokenStore {
  let value: string | null = null;
  return {
    load: () => value,
    save: (next) => {
      value = next;
    },
    clear: () => {
      value = null;
    },
  };
}

function sessionStorageStore(key: string): WindsorTokenStore {
  return {
    load() {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    save(value: string) {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // session-only; in-memory still used
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // best-effort
      }
    },
  };
}

let tokenStore: WindsorTokenStore = memoryStore();
let pendingStore: WindsorTokenStore = memoryStore();
let windsorAuth: WindsorAuth = { kind: "none" };
let persisted: WindsorPersistedTokens | null = null;

export function attachWindsorWebStores(input?: {
  tokens?: WindsorTokenStore;
  pending?: WindsorTokenStore;
}): void {
  tokenStore = input?.tokens ?? memoryStore();
  pendingStore = input?.pending ?? memoryStore();
  applyPersisted(parsePersisted(tokenStore.load()));
}

export function attachBrowserWindsorStores(): void {
  attachWindsorWebStores({
    tokens: sessionStorageStore(WINDSOR_TOKEN_STORAGE_KEY),
    pending: sessionStorageStore(WINDSOR_PENDING_STORAGE_KEY),
  });
}

function parsePersisted(raw: string | null): WindsorPersistedTokens | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.apiKey === "string" || parsed.kind === "api_key") {
      return null;
    }
    const accessToken =
      typeof parsed.accessToken === "string"
        ? parsed.accessToken.trim()
        : typeof parsed.access_token === "string"
          ? parsed.access_token.trim()
          : "";
    if (!accessToken) return null;
    const refreshToken =
      typeof parsed.refreshToken === "string"
        ? parsed.refreshToken
        : typeof parsed.refresh_token === "string"
          ? parsed.refresh_token
          : undefined;
    const expiresAt =
      typeof parsed.expiresAt === "number"
        ? parsed.expiresAt
        : typeof parsed.expires_at === "number"
          ? parsed.expires_at
          : undefined;
    const clientId =
      typeof parsed.clientId === "string"
        ? parsed.clientId
        : typeof parsed.client_id === "string"
          ? parsed.client_id
          : undefined;
    return { accessToken, refreshToken, expiresAt, clientId };
  } catch {
    return null;
  }
}

function applyPersisted(next: WindsorPersistedTokens | null): void {
  persisted = next;
  windsorAuth = next?.accessToken
    ? { kind: "oauth", accessToken: next.accessToken }
    : { kind: "none" };
}

export function getWindsorAuth(): WindsorAuth {
  return windsorAuth;
}

export function getWindsorPersistedTokens(): WindsorPersistedTokens | null {
  return persisted;
}

export function persistWindsorTokens(tokens: WindsorPersistedTokens): void {
  const accessToken = tokens.accessToken.trim();
  if (!accessToken) {
    clearWindsorAuth();
    return;
  }
  const next: WindsorPersistedTokens = {
    accessToken,
    refreshToken: tokens.refreshToken?.trim() || undefined,
    expiresAt: tokens.expiresAt,
    clientId: tokens.clientId?.trim() || undefined,
  };
  applyPersisted(next);
  try {
    tokenStore.save(JSON.stringify(next));
  } catch {
    // in-memory token still used for this session
  }
}

export function clearWindsorAuth(): void {
  applyPersisted(null);
  try {
    tokenStore.clear();
  } catch {
    // ignore
  }
}

export function savePendingWindsorOAuth(pending: WindsorOAuthPending): void {
  pendingStore.save(JSON.stringify(pending));
}

export function loadPendingWindsorOAuth(): WindsorOAuthPending | null {
  const raw = pendingStore.load();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WindsorOAuthPending>;
    if (
      !parsed.clientId?.trim() ||
      !parsed.redirectUri?.trim() ||
      !parsed.codeVerifier?.trim() ||
      !parsed.state?.trim()
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId.trim(),
      redirectUri: parsed.redirectUri.trim(),
      codeVerifier: parsed.codeVerifier.trim(),
      state: parsed.state.trim(),
    };
  } catch {
    return null;
  }
}

export function clearPendingWindsorOAuth(): void {
  pendingStore.clear();
}

export function rejectWindsorApiKey(): never {
  throw new Error("Windsor API keys are forbidden; OAuth only");
}
