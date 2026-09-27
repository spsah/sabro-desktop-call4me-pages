import type { MouseEvent } from "react";

/**
 * Amplify Sales Execution OS nav parity minus Product GP% / P&L (FuseBase-later).
 * Overview + Daily Missions restored for path-MT IA.
 */
export const TENANT_NAV_ITEMS = [
  { label: "Overview", surface: "overview", icon: "📊" },
  { label: "Pipeline", surface: "pipeline", icon: "🔀" },
  { label: "Daily Missions", surface: "missions", icon: "🎯" },
  { label: "AI Insights", surface: "insights", icon: "🤖" },
  { label: "Call4Me", surface: "call4me", icon: "📞" },
  { label: "Deal Management", surface: "deals", icon: "💼" },
] as const;

export type TenantNavSurface = (typeof TENANT_NAV_ITEMS)[number]["surface"];

export type TenantNavProps = {
  clientId: string;
  surface: TenantNavSurface;
  brandLabel: string;
  onNavigate?: (path: string) => void;
};

export function TenantNav({ clientId, surface, brandLabel, onNavigate }: TenantNavProps) {
  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (!onNavigate) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <aside className="tenant-sidebar" data-testid="tenant-sidebar">
      <div className="tenant-sidebar-header">
        <div className="tenant-sidebar-logo">
          <div className="tenant-sidebar-logo-icon" aria-hidden="true">
            ⚡
          </div>
          <div className="tenant-sidebar-logo-text">
            <h1>Sales Execution OS</h1>
            <span>{brandLabel}</span>
          </div>
        </div>
      </div>
      <nav className="tenant-sidebar-nav" aria-label="Tenant">
        {TENANT_NAV_ITEMS.map((item) => {
          const href = `/c/${clientId}/${item.surface}`;
          const active = surface === item.surface;
          return (
            <a
              key={item.surface}
              href={href}
              className={`tenant-nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={(event) => handleNavClick(event, href)}
            >
              <span className="tenant-nav-item-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="tenant-sidebar-footer">
        <div className="tenant-sidebar-footer-info">
          <strong>Powered by SABRO</strong>
          <br />
          Real-time pipeline visibility
        </div>
      </div>
    </aside>
  );
}