import { ExportError } from './ExportError';
import { ExportErrorCode } from './ExportErrorCode';
import { type JsonValue } from './ExportTypes';

/** Clones a JSON-compatible value and rejects values that cannot be persisted as JSON. */
export function cloneJsonValue<TValue>(value: TValue, path = 'value'): TValue {
  if (value === void 0) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as TValue;
  } catch {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Value is not JSON-serializable.', { path });
  }
}

/** Narrows a runtime value to a plain object. */
export function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Expected an object.', { path });
  }
  return value as Record<string, unknown>;
}

/** Narrows a runtime value to a JSON-compatible metadata record. */
export function cloneJsonRecord(value: Readonly<Record<string, unknown>> | undefined, path: string) {
  return value === void 0 ? void 0 : (cloneJsonValue(value, path) as Readonly<Record<string, JsonValue>>);
}
