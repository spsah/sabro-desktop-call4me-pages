import { useEffect, useRef, useState } from "react";
import { Call4Me } from "./sdk";
import { emptyBrandLookup, resolveClientBrandLabel, type BrandLookup } from "./tenant-brand";
import { resolveTenantViaBridge } from "./tenant-map";
import { TenantNav, type TenantNavSurface } from "./TenantNav";
import {
  evaluateTenantAccess,
  resolveDefaultTenantPath,
  type TenantLookup,
  type TenantMapping,
} from "./tenant-path";

export type TenantShellProps = {
  pathname: string;
  /** Injected Identity app_metadata for tests / host; null = unauthenticated. */
  identityAppMetadata: Record<string, unknown> | null;
  /** SABRO Identity access_token for the same-origin tenant-map bridge. */
  accessToken?: string | null;
  /** Injectable fetch for tests; production uses global fetch. */
  fetchImpl?: typeof fetch;
  /** Optional history.replace hook (defaults to window.history.replaceState). */
  onRedirect?: (path: string) => void;
  /** In-app navigation (pushState); every path is re-evaluated by the same guard. */
  onNavigate?: (path: string) => void;
  /** Injectable white-label brand; default null → "SABRO · Client <id>". */
  lookupBrand?: BrandLookup;
  /** Injectable tenant map for tests; does not alter fail-closed guard logic. */
  lookupTenant?: TenantLookup;
};

function surfaceTitle(surface: string): string {
  switch (surface) {
    case "pipeline":
      return "Pipeline";
    case "deals":
      return "Deal Management";
    case "insights":
      return "AI Insights";
    case "call4me":
      return "Call4Me";
    default:
      return surface;
  }
}

function EmptyStateCard({ tenant }: { tenant: TenantMapping }) {
  return (
    <div className="tenant-card">
      <div className="tenant-card-body">
        <p>Data not connected</p>
        {tenant.state === "unmapped" ? (
          <p role="status">tenant not mapped — data disabled</p>
        ) : (
          <p role="status">Tenant mapped — data not connected yet</p>
        )}
      </div>
    </div>
  );
}

const CALL4ME_TABS = ["Today's calls", "Active deals", "Contacts"] as const;
type Call4MeTab = (typeof CALL4ME_TABS)[number];

/** Shell IA → dialer panel. App hides its own subnav when tenantShell mounts. */
function tabToPanel(tab: Call4MeTab): "todays-calls" | "active-deals" | "contacts" {
  switch (tab) {
    case "Active deals":
      return "active-deals";
    case "Contacts":
      return "contacts";
    default:
      return "todays-calls";
  }
}

function Call4MeSurface({
  tenant,
  clientId,
  accessToken,
}: {
  tenant: TenantMapping;
  clientId: string;
  accessToken?: string | null;
}) {
  const [tab, setTab] = useState<Call4MeTab>("Today's calls");
  const mountRef = useRef<HTMLDivElement>(null);
  const mapped = tenant.state === "mapped";

  useEffect(() => {
    if (!mapped) return;
    const host = mountRef.current;
    if (!host) return;
    const widget = Call4Me.mount(host, {
      theme: "sabro",
      tenantShell: true,
      panel: tabToPanel(tab),
      numberMaskLast4: true,
      clientId,
      accessToken: accessToken ?? undefined,
    });
    return () => {
      widget.unmount();
    };
  }, [mapped, tab, clientId, accessToken]);

  return (
    <main data-surface="call4me">
      <header className="tenant-page-header">
        <h1 className="tenant-page-title">Call4Me</h1>
      </header>
      <div className="tenant-call4me-tabs" role="tablist" aria-label="Call4Me">
        {CALL4ME_TABS.map((label) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={tab === label}
            className="tenant-call4me-tab"
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </div>
      {mapped ? (
        <div
          ref={mountRef}
          className="tenant-call4me-dialer"
          data-testid="call4me-dialer-mount"
          data-active-tab={tab}
        />
      ) : (
        <EmptyStateCard tenant={tenant} />
      )}
    </main>
  );
}

function SurfacePage({
  surface,
  clientId,
  tenant,
  accessToken,
}: {
  surface: string;
  clientId: string;
  tenant: TenantMapping;
  accessToken?: string | null;
}) {
  if (surface === "call4me") {
    return (
      <Call4MeSurface
        tenant={tenant}
        clientId={clientId}
        accessToken={accessToken}
      />
    );
  }
  return (
    <main data-surface={surface} data-client-id={clientId}>
      <header className="tenant-page-header">
        <h1 className="tenant-page-title">{surfaceTitle(surface)}</h1>
      </header>
      <EmptyStateCard tenant={tenant} />
    </main>
  );
}

function ResolvingSurface({ surface, clientId }: { surface: string; clientId: string }) {
  return (
    <main data-surface={surface} data-client-id={clientId}>
      <header className="tenant-page-header">
        <h1 className="tenant-page-title">{surfaceTitle(surface)}</h1>
      </header>
      <div className="tenant-card">
        <div className="tenant-card-body">
          <p role="status">Resolving tenant...</p>
        </div>
      </div>
    </main>
  );
}

/**
 * Path shell: fail-closed guard (Stage A) + Amplify IA chrome (Stage B)
 * + same-origin tenant-map resolve (Stage C).
 * EMPTY-SAFE: empty-state cards only; ZERO CRM/deals fetches.
 * The ONLY network call after the guard passes is GET /sabro-auth/tenant-map.
 * Denied states render without nav/brand (no chrome leak).
 */
export function TenantShell({
  pathname,
  identityAppMetadata,
  accessToken = null,
  fetchImpl,
  onRedirect,
  onNavigate,
  lookupBrand = emptyBrandLookup,
  lookupTenant,
}: TenantShellProps) {
  // Stage A sync guard — injectable lookup for tests; production uses empty.
  const result = evaluateTenantAccess({
    pathname,
    identity: identityAppMetadata ? { app_metadata: identityAppMetadata } : null,
    lookupTenant,
  });

  const guardAllowsResolve =
    result.ok && result.surface !== "root" && Boolean(accessToken);

  const resolveKey =
    guardAllowsResolve && result.ok ? `${result.clientId}\0${accessToken}` : null;

  const [resolved, setResolved] = useState<{
    key: string;
    tenant: TenantMapping;
  } | null>(null);

  // Ignore cached React state when clientId or access-token identity changed.
  const bridgeTenant =
    resolveKey && resolved && resolved.key === resolveKey ? resolved.tenant : null;

  useEffect(() => {
    if (!result.ok || result.surface !== "root") return;
    const target = resolveDefaultTenantPath(result.clientId);
    const redirect =
      onRedirect ??
      ((path: string) => {
        window.history.replaceState({}, "", path);
      });
    redirect(target);
  }, [result, onRedirect]);

  // Bridge resolve ONLY after guard ok (and not on root redirect). Never on deny.
  useEffect(() => {
    if (!result.ok || result.surface === "root") {
      return;
    }

    if (!accessToken) {
      return;
    }

    const clientId = result.clientId;
    const key = `${clientId}\0${accessToken}`;
    let cancelled = false;

    void resolveTenantViaBridge({
      clientId,
      accessToken,
      fetchImpl,
    }).then((mapping) => {
      if (cancelled) return;
      setResolved({ key, tenant: mapping });
    });

    return () => {
      cancelled = true;
    };
  }, [
    result.ok,
    result.ok ? result.clientId : null,
    result.ok ? result.surface : null,
    accessToken,
    fetchImpl,
  ]);

  if (!result.ok) {
    if (result.status === 401) {
      return (
        <main className="tenant-deny" data-tenant-shell="401">
          <h1>401 — Sign in</h1>
          <p>Sign in with SABRO Identity to open this workspace.</p>
        </main>
      );
    }
    if (result.status === 403) {
      return (
        <main className="tenant-deny" data-tenant-shell="403">
          <h1>403 — Forbidden</h1>
          <p>{result.reason}</p>
        </main>
      );
    }
    return (
      <main className="tenant-deny" data-tenant-shell="404">
        <h1>404 — Not found</h1>
        <p>{result.reason}</p>
      </main>
    );
  }

  if (result.surface === "root") {
    return (
      <main className="tenant-deny" data-tenant-shell="redirect">
        <h1>Pipeline</h1>
        <p role="status">Redirecting to {resolveDefaultTenantPath(result.clientId)}</p>
      </main>
    );
  }

  const brandLabel = resolveClientBrandLabel(result.clientId, lookupBrand);
  const navSurface = result.surface as TenantNavSurface;
  const showResolving = guardAllowsResolve && bridgeTenant === null;
  const tenant: TenantMapping =
    bridgeTenant ?? (accessToken ? { state: "unmapped" } : result.tenant);

  return (
    <div
      className="tenant-app-layout"
      data-tenant-shell="ok"
      data-client-id={result.clientId}
      data-testid="tenant-chrome"
    >
      <TenantNav
        clientId={result.clientId}
        surface={navSurface}
        brandLabel={brandLabel}
        onNavigate={onNavigate}
      />
      <div className="tenant-main-content">
        {showResolving ? (
          <ResolvingSurface surface={result.surface} clientId={result.clientId} />
        ) : (
          <SurfacePage
            surface={result.surface}
            clientId={result.clientId}
            tenant={tenant}
            accessToken={accessToken}
          />
        )}
      </div>
    </div>
  );
}
