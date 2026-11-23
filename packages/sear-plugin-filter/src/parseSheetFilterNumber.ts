const decimalNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parses a finite decimal value for numeric filter conditions. */
export function parseSheetFilterNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const isPercent = text.endsWith('%');
  const numeric = isPercent ? text.slice(0, -1) : text;
  if (!decimalNumber.test(numeric)) return null;
  const parsed = Number(numeric) / (isPercent ? 100 : 1);
  return Number.isFinite(parsed) ? parsed : null;
}
