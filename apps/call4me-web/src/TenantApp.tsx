import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acceptIdentitySessionFromUrl,
  createIdentityClient,
  extractTrustedIdentity,
  sendMagicLink,
  verifyEmailOtp,
  type TrustedIdentity,
} from "./identity";
import { TenantShell } from "./TenantShell";

/**
 * Host for `/c/:clientId/...` — reuses the existing SABRO Identity helpers
 * (same magic-link / OTP flow as Call4Me / Windsor). No new login invention.
 */
export default function TenantApp() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [identity, setIdentity] = useState<TrustedIdentity | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (!publishableKey) {
      setAuthMessage("Identity is not configured for this build.");
      setAuthReady(true);
      return;
    }
    const client = createIdentityClient(publishableKey);
    clientRef.current = client;
    const acceptSession = async (session: Parameters<typeof extractTrustedIdentity>[0]) => {
      if (!session) {
        setIdentity(null);
        setAuthReady(true);
        return;
      }
      const trusted = extractTrustedIdentity(session);
      if (!trusted) {
        await client.auth.signOut();
        setIdentity(null);
        setAuthMessage("Your account is not enabled for this workspace.");
      } else {
        setIdentity(trusted);
        setAuthMessage("");
      }
      setAuthReady(true);
    };
    void acceptIdentitySessionFromUrl(client)
      .then(async (urlSession) => {
        if (urlSession) return acceptSession(urlSession);
        const { data } = await client.auth.getSession();
        return acceptSession(data.session);
      })
      .catch((error) => {
        setAuthMessage(error instanceof Error ? error.message : "Could not complete sign-in.");
        setAuthReady(true);
      });
    const { data } = client.auth.onAuthStateChange((_event, session) => void acceptSession(session));
    return () => data.subscription.unsubscribe();
  }, []);

  async function requestLink() {
    if (!clientRef.current) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await sendMagicLink(clientRef.current, email);
      setAuthMessage("Check your email for the sign-in link or one-time code.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not send sign-in email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitCode() {
    if (!clientRef.current) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      setIdentity(await verifyEmailOtp(clientRef.current, email, otp));
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "The code could not be verified.");
    } finally {
      setAuthBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main className="tenant-loading">
        <p>Loading…</p>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className="tenant-auth" data-tenant-shell="401">
        <h1>401 — Sign in</h1>
        <p>Sign in with SABRO Identity to open this workspace.</p>
        <label>
          Email
          <input
            aria-label="Email"
            autoComplete="email"
            disabled={authBusy}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            value={email}
          />
        </label>
        <button disabled={authBusy || !clientRef.current} onClick={() => void requestLink()}>
          Send sign-in link
        </button>
        <label>
          One-time code
          <input
            aria-label="One-time code"
            disabled={authBusy}
            onChange={(e) => setOtp(e.target.value)}
            value={otp}
          />
        </label>
        <button disabled={authBusy || !clientRef.current} onClick={() => void submitCode()}>
          Verify code
        </button>
        {authMessage ? <p role="status">{authMessage}</p> : null}
      </main>
    );
  }

  const go = (path: string) => {
    window.history.pushState({}, "", path);
    setPathname(path);
  };

  return (
    <TenantShell
      pathname={pathname}
      identityAppMetadata={identity.session.user.app_metadata as Record<string, unknown>}
      accessToken={identity.session.access_token}
      onRedirect={(path) => {
        window.history.replaceState({}, "", path);
        setPathname(path);
      }}
      onNavigate={go}
    />
  );
}
