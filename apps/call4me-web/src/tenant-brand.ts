/**
 * Injectable white-label brand for tenant chrome.
 * Default returns null → fallback "SABRO · Client <clientId>".
 * NEVER hardcode MMPL / Ice / tenant names. Never read build/process env.
 */

export type BrandLookup = (clientId: string) => string | null | undefined;

export const emptyBrandLookup: BrandLookup = () => null;

export function resolveClientBrandLabel(
  clientId: string,
  lookupBrand: BrandLookup = emptyBrandLookup,
): string {
  const custom = lookupBrand(clientId);
  if (typeof custom === "string" && custom.trim().length > 0) {
    return custom.trim();
  }
  return `SABRO · Client ${clientId}`;
}
