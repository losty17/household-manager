// Keep this aligned with backend/app/number_utils.py EPSILON.
export const DECIMAL_EPSILON = 1e-9;
export const DEFAULT_DECIMAL_PLACES = 6;

export function roundDecimal(value: number, places = DEFAULT_DECIMAL_PLACES): number {
  const rounded = Number(value.toFixed(places));
  return Math.abs(rounded) <= DECIMAL_EPSILON ? 0 : rounded;
}

export function roundNonNegativeDecimal(value: number, places = DEFAULT_DECIMAL_PLACES): number {
  const rounded = roundDecimal(value, places);
  return Math.max(rounded, 0);
}

export function parseNormalizedDecimal(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return roundDecimal(parsed);
}

export function parseNormalizedNonNegativeDecimal(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < -DECIMAL_EPSILON) return undefined;
  return roundNonNegativeDecimal(parsed);
}

export function isEffectivelyPositive(value: number): boolean {
  return value > DECIMAL_EPSILON;
}
