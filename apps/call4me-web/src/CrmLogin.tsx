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

export default function CrmLogin() {
  const [identity, setIdentity] = useState<TrustedIdentity | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (!key) {
      setMessage("Sign-in is not configured.");
      setReady(true);
      return;
    }
    const client = createIdentityClient(key);
    clientRef.current = client;
    const accept = (session: Parameters<typeof extractTrustedIdentity>[0]) => {
      const trusted = extractTrustedIdentity(session);
      setIdentity(trusted);
      if (session && !trusted) setMessage("Your account is not enabled for this workspace.");
      setReady(true);
    };
    void acceptIdentitySessionFromUrl(client)
      .then(async (session) => {
        if (session) return accept(session);
        const { data } = await client.auth.getSession();
        accept(data.session);
      })
      .catch(() => {
        setMessage("Sign-in could not be completed. Please try again.");
        setReady(true);
      });
    const { data } = client.auth.onAuthStateChange((_event, session) => accept(session));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    setBusy(true);
    setMessage("Opening your workspace…");
    void fetch("/sabro-auth/session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${identity.session.access_token}`,
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("bridge");
        if (!cancelled) window.location.replace("/");
      })
      .catch(() => {
        if (!cancelled) {
          setBusy(false);
          setMessage("Your workspace could not be opened. Please try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  async function requestLink() {
    if (!clientRef.current) return;
    setBusy(true);
    setMessage("");
    try {
      await sendMagicLink(clientRef.current, email);
      setMessage("Check your email for the sign-in link or one-time code.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in email could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!clientRef.current) return;
    setBusy(true);
    setMessage("");
    try {
      setIdentity(await verifyEmailOtp(clientRef.current, email, otp));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The code could not be verified.");
      setBusy(false);
    }
  }

  if (!ready) {
    return <main className="center-card"><p>Checking SABRO Identity…</p></main>;
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="SABRO Identity sign in">
        <p className="eyebrow">SABRO IDENTITY</p>
        <h1>Sign in to CRM</h1>
        <p className="muted">Use your invited SABRO account. No separate CRM password is needed.</p>
        {!identity ? (
          <>
            <label>Email<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
            <button disabled={busy || !clientRef.current} onClick={() => void requestLink()}>Send sign-in link</button>
            <div className="divider"><span>or enter code</span></div>
            <label>One-time code<input autoComplete="one-time-code" inputMode="numeric" onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} value={otp} /></label>
            <button className="secondary" disabled={busy || !otp} onClick={() => void submitCode()}>Verify code</button>
          </>
        ) : null}
        {message ? <p className="message" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
