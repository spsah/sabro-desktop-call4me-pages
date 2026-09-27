import { fireEvent, render, screen, within } from "@testing-library/react";
import { PipelineBoard } from "./PipelineBoard";
import type { PipelineDealCard } from "./pipeline-stages";

const SAMPLE: PipelineDealCard[] = [
  {
    id: "d1",
    dealName: "Acme rollout",
    companyName: "Acme Ltd",
    stage: "Qualified",
    gpValue: 12000,
    priority: "HOT",
    salesperson: "Alex",
  },
  {
    id: "d2",
    dealName: "Beta renewal",
    stage: "Proposal",
    gpValue: 8000,
    priority: "WARM",
  },
];

describe("PipelineBoard Amplify IA port", () => {
  it("renders five stage columns and deal cards without Ice sample names", () => {
    render(
      <PipelineBoard clientId="6402" initialDeals={SAMPLE} />,
    );
    expect(screen.getByTestId("pipeline-kanban")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /pipeline kanban board/i })).toBeInTheDocument();
    for (const stage of ["Qualified", "Proposal", "Negotiation", "Commit", "Won"]) {
      expect(screen.getByLabelText(stage)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /deal acme rollout/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bIce\b/);
    expect(document.body.textContent).not.toMatch(/MMPL/i);
  });

  it("opens a deal modal on card click", () => {
    render(<PipelineBoard clientId="6402" initialDeals={SAMPLE} />);
    fireEvent.click(screen.getByRole("button", { name: /deal acme rollout/i }));
    const dialog = screen.getByRole("dialog", { name: /deal acme rollout/i });
    expect(within(dialog).getByText(/Stage:/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /open in deal management/i })).toBeInTheDocument();
  });

  it("moves a card to another stage on drop", () => {
    render(<PipelineBoard clientId="6402" initialDeals={SAMPLE} />);
    const card = screen.getByRole("button", { name: /deal acme rollout/i });
    const commit = screen.getByLabelText("Commit");
    fireEvent.dragStart(card);
    fireEvent.dragOver(commit);
    fireEvent.drop(commit);
    fireEvent.dragEnd(card);
    expect(within(commit).getByRole("button", { name: /deal acme rollout/i })).toBeInTheDocument();
  });

  it("EMPTY-SAFE empty columns when no deals", () => {
    render(<PipelineBoard clientId="6402" initialDeals={[]} />);
    expect(screen.getAllByText(/Drop deals here|Drag won deals here/).length).toBeGreaterThanOrEqual(5);
  });
});