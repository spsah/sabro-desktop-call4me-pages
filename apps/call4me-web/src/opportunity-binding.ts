import { isOpportunityId } from "./verto";

/** Valid deal UUID from mount or query; otherwise unbound. */
export function boundOpportunityId(opportunityId: string): string | undefined {
  const trimmed = opportunityId.trim();
  return isOpportunityId(trimmed) ? trimmed : undefined;
}

export function isOpportunityDialable(
  opportunityId: string,
  allowUnboundOpportunity: boolean,
): boolean {
  return Boolean(boundOpportunityId(opportunityId)) || allowUnboundOpportunity;
}

/** Paste field is only for the legacy “must bind a deal” standalone path. */
export function showDealIdField(
  allowUnboundOpportunity: boolean,
  embeddedSurface: boolean,
): boolean {
  return !allowUnboundOpportunity && !embeddedSurface;
}
