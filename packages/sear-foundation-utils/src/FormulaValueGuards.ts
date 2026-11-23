/** Returns whether a value is a JavaScript number. */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/** Type guard for formula error-shaped values. */
export function isFormulaError<T>(value: T): value is T & { kind: 'error'; code: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'error' &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

/** Returns whether a value carries text-specific formula coercion semantics. */
export function isFormulaText<T>(value: T): value is T & {
  kind: 'text';
  value: string;
  numericCoercion: 'allow' | 'deny';
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'text' &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}
