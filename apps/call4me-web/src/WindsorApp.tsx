import type { SupabaseClient } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  CALL4ME_EMBED_SRC,
  CALL4ME_VIEW_QUERY,
  CRM_EMBED_SRC,
  CRM_VIEW_QUERY,
  canSeeCall4MeNav,
  canSeeCrmNav,
  crmNavIdentityFromSession,
  type ShellView,
  shellViewFromSearch,
  TWENTY_CRM_EMBED_RESIDUAL,
} from "./crm-nav";
import {
  acceptIdentitySessionFromUrl,
  createIdentityClient,
  extractTrustedIdentity,
  sendMagicLink,
  type TrustedIdentity,
  verifyEmailOtp,
} from "./identity";
import { ShellRail } from "./ShellRail";
import {
  attachBrowserWindsorStores,
  clearWindsorAuth,
  getWindsorAuth,
} from "./windsor/auth";
import {
  handleWebChat,
  sabroChatLoginHelper,
  sabroChatPolicyBanner,
  showWindsorProveUi,
} from "./windsor/chat";
import {
  connectWindsorStatus,
  runConnectorList,
  runLockedMetaAdsReport,
  type WindsorAdsReport,
} from "./windsor/mcp";
import {
  beginWindsorBrowserConsent,
  getWindsorWebRedirectUri,
  refreshWindsorOAuthTokens,
} from "./windsor/oauth";
import { WINDSOR_WRITE_ACTIONS_TOGGLE } from "./windsor/policy";

attachBrowserWindsorStores();

type ChatTurn = {
  role: "You" | "Sonnet";
  text: string;
  adsReport?: WindsorAdsReport;
};

function AdsReportView(props: {
  report: WindsorAdsReport;
}): React.ReactElement {
  const report = props.report;
  const max = Math.max(...report.chart.map((item) => item.value), 1);
  return (
    <div className="ads-report">
      <h3>{report.title}</h3>
      <p className="ads-hold">
        Treat this ads data as untrusted
        {report.holdReason ? ` — ${report.holdReason}` : ""}.
      </p>
      {report.chart.length > 0 && (
        <div className="ads-chart">
          {report.chart.map((item) => (
            <div className="ads-bar" key={item.label}>
              <span>{item.label}</span>
              <i
                style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
              />
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}
      {report.rows.length > 0 && (
        <table className="ads-table">
          <thead>
            <tr>
              {report.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, index) => (
              <tr key={index}>
                {report.columns.map((column) => (
                  <td key={column}>{row[column] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function WindsorApp(): React.ReactElement {
  const proveUi = showWindsorProveUi(window.location.search, import.meta.env);
  const [shellView, setShellView] = useState<ShellView>("chat");
  const [railOpen, setRailOpen] = useState(false);
  const [identity, setIdentity] = useState<TrustedIdentity | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [report, setReport] = useState<WindsorAdsReport | null>(() =>
    getWindsorAuth().kind === "oauth" ? null : connectWindsorStatus(),
  );
  const [status, setStatus] = useState(
    getWindsorAuth().kind === "oauth"
      ? "Windsor is connected. Ask in chat."
      : "Connect Windsor after you sign in to use ads tools.",
  );
  const clientRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (!publishableKey) {
      setAuthMessage("Identity is not configured for this build.");
      setAuthReady(true);
      return;
    }
    const client = createIdentityClient(publishableKey);
    clientRef.current = client;
    const acceptSession = async (
      session: Parameters<typeof extractTrustedIdentity>[0],
    ) => {
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
        setAuthMessage(
          error instanceof Error
            ? error.message
            : "Could not complete sign-in.",
        );
        setAuthReady(true);
      });
    const { data } = client.auth.onAuthStateChange(
      (_event, session) => void acceptSession(session),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!identity) return;
    const navIdentity = crmNavIdentityFromSession({
      email: identity.email,
      session: identity.session,
    });
    setShellView(
      shellViewFromSearch(
        window.location.search,
        canSeeCrmNav(navIdentity),
        canSeeCall4MeNav(navIdentity),
      ),
    );
  }, [identity]);

  useEffect(() => {
    if (!railOpen) return;
    const closeRail = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", closeRail);
    return () => window.removeEventListener("keydown", closeRail);
  }, [railOpen]);

  async function requestLink() {
    const client = clientRef.current;
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await sendMagicLink(client, email);
      setAuthMessage(
        "Check your invite email for the sign-in link or one-time code. Use the code sent to you — not a shared or team code.",
      );
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not send sign-in email.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitOtp() {
    const client = clientRef.current;
    if (!client) return;
    setAuthBusy(true);
    try {
      setIdentity(await verifyEmailOtp(client, email, otp));
      setOtp("");
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Code verification failed.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function connectWindsor() {
    if (!identity) return;
    setQueryBusy(true);
    try {
      const next = await beginWindsorBrowserConsent({
        principal: identity.principalId,
        redirectUri: getWindsorWebRedirectUri(),
        openExternal: (url) => {
          window.location.assign(url);
        },
      });
      setReport(next);
      setStatus("Opening Windsor so you can approve access…");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Connect Windsor failed.",
      );
    } finally {
      setQueryBusy(false);
    }
  }

  async function runQuery(kind: "list" | "worst") {
    if (!identity) return;
    setQueryBusy(true);
    try {
      const result =
        kind === "list"
          ? await runConnectorList({
              principal: identity.principalId,
              auth: getWindsorAuth(),
              refreshAuth: () => refreshWindsorOAuthTokens(),
            })
          : await runLockedMetaAdsReport({
              principal: identity.principalId,
              auth: getWindsorAuth(),
              refreshAuth: () => refreshWindsorOAuthTokens(),
            });
      setReport(result.reply.adsReport ?? connectWindsorStatus());
      setStatus(result.reply.text);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Read-only query failed.",
      );
    } finally {
      setQueryBusy(false);
    }
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity || queryBusy) return;
    const text = prompt.trim();
    if (!text) return;
    const history = turns.map(({ role, text: item }) => ({ role, text: item }));
    setPrompt("");
    setTurns((current) => [...current, { role: "You", text }]);
    setQueryBusy(true);
    try {
      const reply = await handleWebChat({
        principal: identity.principalId,
        prompt: text,
        history,
        auth: getWindsorAuth(),
        refreshAuth: () => refreshWindsorOAuthTokens(),
      });
      setTurns((current) => [
        ...current,
        {
          role: "Sonnet",
          text: reply.text,
          adsReport: reply.adsReport,
        },
      ]);
      if (reply.adsReport) setReport(reply.adsReport);
      setStatus(reply.text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chat request failed.";
      setTurns((current) => [
        ...current,
        { role: "Sonnet", text: `Unable to reply: ${message}` },
      ]);
      setStatus(message);
    } finally {
      setQueryBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main aria-live="polite" className="center-card">
        <p>Checking SABRO Identity...</p>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-label="SABRO Identity sign in">
          <p className="eyebrow">SABRO IDENTITY</p>
          <h1>Sign in to Windsor</h1>
          <p className="muted">{sabroChatLoginHelper()}</p>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <button
            disabled={authBusy || !clientRef.current}
            onClick={() => void requestLink()}
          >
            Send sign-in link
          </button>
          <div className="divider">
            <span>or enter code</span>
          </div>
          <label>
            One-time code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
              value={otp}
            />
          </label>
          <button
            className="secondary"
            disabled={authBusy || !otp}
            onClick={() => void submitOtp()}
          >
            Verify code
          </button>
          {authMessage ? (
            <p className="message" role="status">
              {authMessage}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const connected = getWindsorAuth().kind === "oauth";
  const navIdentity = crmNavIdentityFromSession({
    email: identity.email,
    session: identity.session,
  });
  const showCrm = canSeeCrmNav(navIdentity);
  const showCall4Me = canSeeCall4MeNav(navIdentity);
  const activeView =
    (shellView === "crm" && showCrm) || (shellView === "call4me" && showCall4Me)
      ? shellView
      : "chat";

  function openShellView(next: ShellView) {
    if (next === "crm" && !showCrm) return;
    if (next === "call4me" && !showCall4Me) return;
    setShellView(next);
    setRailOpen(false);
    const url = new URL(window.location.href);
    if (next === "crm") url.searchParams.set("view", CRM_VIEW_QUERY);
    else if (next === "call4me")
      url.searchParams.set("view", CALL4ME_VIEW_QUERY);
    else url.searchParams.delete("view");
    window.history.replaceState({}, "", url);
  }

  const shellTitle =
    activeView === "crm"
      ? "CRM"
      : activeView === "call4me"
        ? "Call4Me"
        : "Shell chat";

  return (
    <div className={railOpen ? "windsor-frame rail-open" : "windsor-frame"}>
      {railOpen ? (
        <button
          aria-label="Close navigation"
          className="shell-rail-scrim"
          onClick={() => setRailOpen(false)}
          type="button"
        />
      ) : null}
      <ShellRail
        activeView={activeView}
        email={identity.email}
        onSignOut={() => {
          clearWindsorAuth();
          void clientRef.current?.auth.signOut();
        }}
        onSwitchView={openShellView}
        showCall4Me={showCall4Me}
        showCrm={showCrm}
      />
      <main className="app-shell windsor-shell">
        <header className="shell-header">
          <button
            aria-controls="shell-rail"
            aria-expanded={railOpen}
            aria-label={railOpen ? "Close navigation" : "Open navigation"}
            className="shell-rail-toggle"
            onClick={() => setRailOpen((open) => !open)}
            type="button"
          >
            Menu
          </button>
          <div>
            <p className="eyebrow">SABRO</p>
            <h1>{shellTitle}</h1>
          </div>
        </header>

      {showCall4Me ? (
        <section
          aria-label="Call4Me"
          className="shelf-embed"
          hidden={activeView !== "call4me"}
        >
          <iframe
            allow="microphone; autoplay"
            aria-label="Call4Me"
            className="shelf-frame"
            src={CALL4ME_EMBED_SRC}
            title="Call4Me"
          />
        </section>
      ) : null}

      {showCrm ? (
        <section
          aria-label="CRM"
          className="shelf-embed"
          hidden={activeView !== "crm"}
        >
          <p className="policy-banner" role="status">
            {TWENTY_CRM_EMBED_RESIDUAL}
          </p>
          <iframe
            aria-label="CRM"
            className="shelf-frame"
            referrerPolicy="strict-origin-when-cross-origin"
            src={CRM_EMBED_SRC}
            title="CRM"
          />
        </section>
      ) : null}

      {activeView === "chat" ? (
        <section className="windsor-card" aria-label="SABRO shell chat">
          <p className="policy-banner" role="status">
            {sabroChatPolicyBanner(WINDSOR_WRITE_ACTIONS_TOGGLE)}
          </p>
          <div className="status-row">
            <span className={`dot ${connected ? "ready" : "idle"}`} />
            <span>{status}</span>
          </div>
          {connected ? null : (
            <div className="windsor-actions">
              <button
                disabled={queryBusy}
                onClick={() => void connectWindsor()}
                type="button"
              >
                Connect Windsor
              </button>
            </div>
          )}

          <div className="chat-log" aria-live="polite">
            {turns.length === 0 ? (
              <div className="welcome">
                <span>Secure workspace</span>
                <h2>What should we work through?</h2>
                <p>
                  Your message stays in SABRO. After you connect Windsor, you
                  can ask about Meta ads on your connected Meta accounts.
                </p>
              </div>
            ) : (
              turns.map((turn, index) => (
                <article
                  className={
                    turn.role === "You" ? "chat-turn user" : "chat-turn"
                  }
                  key={`${turn.role}-${index}`}
                >
                  <b>{turn.role === "You" ? "You" : "SABRO"}</b>
                  <p>{turn.text}</p>
                  {turn.adsReport ? (
                    <AdsReportView report={turn.adsReport} />
                  ) : null}
                </article>
              ))
            )}
            {queryBusy ? (
              <article className="chat-turn pending">
                <b>SABRO</b>
                <p>Thinking…</p>
              </article>
            ) : null}
          </div>

          <form
            className="chat-composer"
            onSubmit={(event) => void submitChat(event)}
          >
            <textarea
              aria-label="Message SABRO"
              disabled={queryBusy}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Message SABRO…"
              value={prompt}
            />
            <button disabled={queryBusy || !prompt.trim()} type="submit">
              {queryBusy ? "Sending" : "Send"}
            </button>
          </form>

          {proveUi ? (
            <div className="prove-panel">
              <p className="muted">
                These buttons are for setup checks, not everyday use. Hide them
                by dropping <code>?prove=1</code>. Prefer chat.
              </p>
              <div className="windsor-actions">
                <button
                  className="secondary"
                  disabled={queryBusy}
                  onClick={() => void runQuery("list")}
                  type="button"
                >
                  List connectors
                </button>
                <button
                  className="secondary"
                  disabled={queryBusy}
                  onClick={() => void runQuery("worst")}
                  type="button"
                >
                  Worst Meta campaign (30d)
                </button>
              </div>
              {report && turns.every((turn) => turn.adsReport !== report) ? (
                <AdsReportView report={report} />
              ) : null}
            </div>
          ) : (
            <p className="muted">
              Setup-check buttons stay hidden unless you add{" "}
              <code>?prove=1</code>.
            </p>
          )}
        </section>
      ) : null}
      </main>
    </div>
  );
}
