import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { type HomeCountry, parseHomeCountry } from "./e164";

export const SUPABASE_URL = "https://pklldvhivaohqzewuzuv.supabase.co";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TrustedIdentity = {
  email: string;
  principalId: string;
  session: Session;
  /**
   * TODO(CR-CALL4ME-DIAL-E164-HOME-COUNTRY-001): Identity `sabro_principal.home_country`
   * is not in this repo's schema yet. Stub reads trusted `app_metadata.home_country`
   * (GB default) until L0 stamps the principal column / JWT claim.
   */
  homeCountry: HomeCountry;
};

export function extractTrustedIdentity(
  session: Session | null,
): TrustedIdentity | null {
  const principal = session?.user?.app_metadata?.principal_id;
  if (typeof principal !== "string" || !UUID.test(principal.trim()))
    return null;
  return {
    email: session?.user.email ?? "",
    principalId: principal.trim(),
    session: session!,
    homeCountry: parseHomeCountry(session?.user?.app_metadata?.home_country),
  };
}

export function createIdentityClient(publishableKey: string): SupabaseClient {
  if (!publishableKey.trim())
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is required");
  return createClient(SUPABASE_URL, publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export async function acceptIdentitySessionFromUrl(
  client: SupabaseClient,
  location: Pick<Location, "hash" | "pathname" | "search"> = window.location,
): Promise<Session | null> {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  window.history.replaceState(
    {},
    document.title,
    `${location.pathname}${location.search}`,
  );
  return data.session;
}

export async function sendMagicLink(
  client: SupabaseClient,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid invited email address.");
  }
  const { error } = await client.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<TrustedIdentity> {
  if (!/^\d{6,8}$/.test(token.trim()))
    throw new Error("Enter the code from your email.");
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
  const identity = extractTrustedIdentity(data.session);
  if (!identity) {
    await client.auth.signOut();
    throw new Error("Your account is not enabled for this workspace.");
  }
  return identity;
}
