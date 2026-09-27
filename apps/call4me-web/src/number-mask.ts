/**
 * Tenant flag `number_mask_last4` (MMPL default ON).
 * Masks customer/contact numbers for DISPLAY only; dial targets stay full.
 * Staff extensions (3–4 digit) are never masked.
 */
export function numberMaskLast4(
  value: string,
  maskLast4: boolean = true,
): string {
  if (!maskLast4) return value;
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;

  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return value;
  // Extensions / short codes: never mask 1–4 digit numbers.
  if (digits.length <= 4) return value;

  const last4 = digits.slice(-4);
  const maskedLen = digits.length - 4;
  return `${"X".repeat(maskedLen)}${last4}`;
}

/** Snake_case alias matching the tenant flag name. */
export const number_mask_last4 = numberMaskLast4;
