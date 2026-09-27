import { useEffect, useRef, useState, type DragEvent } from "react";
import { fetchTenantDeals, type TenantDeal } from "./tenant-deals";
import {
  DEFAULT_PIPELINE_STAGES,
  formatGp,
  type PipelineDealCard,
} from "./pipeline-stages";

export type PipelineBoardProps = {
  clientId: string;
  accessToken?: string | null;
  /** Injected deals for tests / EMPTY-SAFE demos (no Ice names). */
  initialDeals?: PipelineDealCard[];
  fetchImpl?: typeof fetch;
  onOpenDealManagement?: (dealId: string) => void;
};

function fromTenantDeal(row: TenantDeal): PipelineDealCard {
  return {
    id: row.id,
    dealName: row.name,
    stage: row.stage?.trim() || "Qualified",
    telephone: row.telephone,
    note: row.note,
    companyName: row.note,
  };
}

function priorityGlyph(priority: PipelineDealCard["priority"]): string {
  if (priority === "HOT") return "HOT";
  if (priority === "WARM") return "WARM";
  if (priority === "COLD") return "COLD";
  return "";
}

/**
 * Amplify demo-mmpl kanban port: HTML5 drag-and-drop + click-to-open deal.
 * EMPTY-SAFE: empty columns when no deals; never paints Ice sample names for MMPL.
 */
export function PipelineBoard({
  clientId,
  accessToken,
  initialDeals,
  fetchImpl,
  onOpenDealManagement,
}: PipelineBoardProps) {
  const stages = DEFAULT_PIPELINE_STAGES;
  const [deals, setDeals] = useState<PipelineDealCard[]>(initialDeals ?? []);
  const [loading, setLoading] = useState(!initialDeals);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [selected, setSelected] = useState<PipelineDealCard | null>(null);
  const lastDragTime = useRef(0);

  useEffect(() => {
    if (initialDeals) {
      setDeals(initialDeals);
      setLoading(false);
      return;
    }
    if (!accessToken) {
      setDeals([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchTenantDeals({ clientId, accessToken, fetchImpl }).then((rows) => {
      if (cancelled) return;
      setDeals(rows.map(fromTenantDeal));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, accessToken, fetchImpl, initialDeals]);

  function openCard(deal: PipelineDealCard) {
    if (Date.now() - lastDragTime.current < 150) return;
    setSelected(deal);
  }

  function handleDragStart(dealId: string) {
    lastDragTime.current = Date.now();
    setDraggedDeal(dealId);
  }

  function handleDragEnd() {
    lastDragTime.current = 0;
    setDraggedDeal(null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over");
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.currentTarget.classList.remove("drag-over");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetStage: string) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    if (!draggedDeal) return;
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === draggedDeal ? { ...deal, stage: targetStage } : deal,
      ),
    );
    setDraggedDeal(null);
  }

  const activeCount = deals.filter((d) => d.stage !== "Won").length;

  return (
    <div className="pipeline-board" data-testid="pipeline-kanban">
      <header className="tenant-page-header">
        <div>
          <h1 className="tenant-page-title">Pipeline Kanban Board</h1>
          <p className="tenant-page-subtitle">
            Drag between stages to update · click any card to open ·{" "}
            <span>{loading ? "Syncing…" : "Connected"}</span>
          </p>
        </div>
        <div className="pipeline-board-meta" role="status">
          {activeCount} Active · {deals.length} Total
        </div>
      </header>

      <div className="kanban-scroll">
        <div id="kanban-board" className="kanban-board" role="list">
          {stages.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.name);
            return (
              <div
                key={stage.id}
                className="kanban-column"
                role="list"
                aria-label={stage.name}
                data-stage={stage.name}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop(event, stage.name)}
              >
                <div className="kanban-column-header">
                  <span
                    className="kanban-stage-dot"
                    style={{ background: stage.color }}
                    aria-hidden="true"
                  />
                  <strong>{stage.name}</strong>
                  <span className="kanban-column-count">{stageDeals.length}</span>
                  <span className="kanban-stage-prob">{stage.defaultProbability}%</span>
                </div>
                <div className="kanban-column-body">
                  {stageDeals.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      className={`kanban-card${draggedDeal === deal.id ? " dragging" : ""}`}
                      draggable
                      data-deal-id={deal.id}
                      aria-label={`Deal ${deal.dealName}`}
                      onDragStart={() => handleDragStart(deal.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openCard(deal)}
                    >
                      <span className="kanban-card-title">{deal.dealName}</span>
                      {deal.companyName && deal.companyName !== deal.dealName ? (
                        <span className="kanban-card-company">{deal.companyName}</span>
                      ) : null}
                      <span className="kanban-card-row">
                        <span>GP</span>
                        <strong>{formatGp(deal.gpValue)}</strong>
                      </span>
                      {deal.expectedCloseDate ? (
                        <span className="kanban-card-row">
                          <span>Close</span>
                          <span>{deal.expectedCloseDate}</span>
                        </span>
                      ) : null}
                      <span className="kanban-card-meta">
                        {deal.salesperson ? <span>{deal.salesperson}</span> : null}
                        {deal.priority ? (
                          <span className={`kanban-priority kanban-priority-${deal.priority.toLowerCase()}`}>
                            {priorityGlyph(deal.priority)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                  {stageDeals.length === 0 ? (
                    <div className="kanban-drop-hint" role="status">
                      {stage.name === "Won" ? "Drag won deals here" : "Drop deals here"}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div
          className="deal-modal-overlay"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <div
            className="deal-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Deal ${selected.dealName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="deal-modal-header">
              <div>
                <h2>{selected.dealName}</h2>
                {selected.companyName ? <p>{selected.companyName}</p> : null}
              </div>
              <button type="button" className="deal-modal-close" onClick={() => setSelected(null)}>
                Close
              </button>
            </header>
            <div className="deal-modal-body">
              <p>
                <strong>Stage:</strong> {selected.stage}
              </p>
              <p>
                <strong>GP:</strong> {formatGp(selected.gpValue)}
              </p>
              {selected.telephone ? (
                <p>
                  <strong>Phone:</strong> {selected.telephone}
                </p>
              ) : null}
              {selected.note ? (
                <p>
                  <strong>Note:</strong> {selected.note}
                </p>
              ) : null}
            </div>
            <footer className="deal-modal-footer">
              <button
                type="button"
                className="deal-modal-primary"
                onClick={() => {
                  onOpenDealManagement?.(selected.id);
                  setSelected(null);
                }}
              >
                Open in Deal Management
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
