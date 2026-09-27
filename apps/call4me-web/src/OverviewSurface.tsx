import { useEffect, useState } from "react";
import { fetchTenantDeals } from "./tenant-deals";
import { formatGp } from "./pipeline-stages";

export type OverviewSurfaceProps = {
  clientId: string;
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  onNavigate?: (path: string) => void;
};

/**
 * Amplify Overview rail surface — EMPTY-SAFE KPI strip + pipeline CTA.
 * No Ice sample names; zeros when deals bridge is empty/unavailable.
 */
export function OverviewSurface({
  clientId,
  accessToken,
  fetchImpl,
  onNavigate,
}: OverviewSurfaceProps) {
  const [liveDeals, setLiveDeals] = useState(0);
  const [pipelineGp, setPipelineGp] = useState(0);
  const [loading, setLoading] = useState(Boolean(accessToken));

  useEffect(() => {
    if (!accessToken) {
      setLiveDeals(0);
      setPipelineGp(0);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchTenantDeals({ clientId, accessToken, fetchImpl }).then((rows) => {
      if (cancelled) return;
      setLiveDeals(rows.length);
      setPipelineGp(0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, accessToken, fetchImpl]);

  const pipelineHref = `/c/${clientId}/pipeline`;

  return (
    <main className="overview-surface" data-surface="overview" data-testid="overview-surface">
      <header className="tenant-page-header">
        <h1 className="tenant-page-title">Overview</h1>
        <p className="tenant-page-subtitle">
          Command center · {loading ? "Syncing…" : "Connected"}
        </p>
      </header>

      <div className="overview-kpi-grid" role="list">
        <div className="overview-kpi" role="listitem">
          <span className="overview-kpi-label">Live deals</span>
          <strong className="overview-kpi-value">{liveDeals}</strong>
        </div>
        <div className="overview-kpi" role="listitem">
          <span className="overview-kpi-label">Pipeline GP</span>
          <strong className="overview-kpi-value">{formatGp(pipelineGp)}</strong>
        </div>
        <div className="overview-kpi" role="listitem">
          <span className="overview-kpi-label">Open stages</span>
          <strong className="overview-kpi-value">5</strong>
        </div>
      </div>

      <div className="overview-cta">
        <a
          href={pipelineHref}
          className="overview-cta-link"
          onClick={(event) => {
            if (!onNavigate) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (event.button !== 0) return;
            event.preventDefault();
            onNavigate(pipelineHref);
          }}
        >
          Open Pipeline Kanban
        </a>
      </div>
    </main>
  );
}