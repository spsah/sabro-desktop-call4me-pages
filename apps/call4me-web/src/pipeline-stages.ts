/** Amplify demo-mmpl stage canon (names/probs/colors). No Ice deal names. */
export type PipelineStage = {
  id: string;
  name: string;
  order: number;
  defaultProbability: number;
  color: string;
};

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: "1", name: "Qualified", order: 1, defaultProbability: 20, color: "#3b82f6" },
  { id: "2", name: "Proposal", order: 2, defaultProbability: 40, color: "#f59e0b" },
  { id: "3", name: "Negotiation", order: 3, defaultProbability: 60, color: "#ef4444" },
  { id: "4", name: "Commit", order: 4, defaultProbability: 80, color: "#10b981" },
  { id: "5", name: "Won", order: 5, defaultProbability: 100, color: "#22c55e" },
];

export type PipelineDealCard = {
  id: string;
  dealName: string;
  companyName?: string;
  stage: string;
  gpValue?: number;
  priority?: "HOT" | "WARM" | "COLD";
  salesperson?: string;
  expectedCloseDate?: string;
  telephone?: string;
  note?: string;
};

export function formatGp(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}