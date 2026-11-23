import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetDocumentState } from './SheetEditorContracts';

/** Takes ownership of an input Sheet snapshot without retaining caller-owned mutable values. */
export function cloneSheetDocumentState(state: SheetDocumentState): SheetDocumentState {
  return cloneDocumentValue(state);
}

function cloneDocumentValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneDocumentValue) as T;
  if (value instanceof CSRMatrix) {
    return CSRMatrix.prototype.cloneForStaging.call(value, cloneDocumentValue) as T;
  }
  const clone = (value as { clone?: () => T }).clone;
  if (typeof clone === 'function') {
    const copy = clone.call(value);
    if (copy === value || copy === null || typeof copy !== 'object') {
      throw new SearError('Sheet document clone must return an independent object.');
    }
    assertIndependentClone(value, copy);
    return copy;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDocumentValue(entry)])) as T;
  }
  throw new SearError('Sheet document state contains a value without a clone contract.', {
    valueType: (value as object).constructor?.name,
  });
}

function assertIndependentClone(source: object, copy: object): void {
  const sourceReferences = new WeakSet<object>();
  visitObjectGraph(source, new WeakSet<object>(), (entry) => sourceReferences.add(entry));
  visitObjectGraph(copy, new WeakSet<object>(), (entry) => {
    if (sourceReferences.has(entry)) throw new SearError('Sheet document clone retained mutable input references.');
  });
}

function visitObjectGraph(value: unknown, seen: WeakSet<object>, visit: (entry: object) => void): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  visit(value);
  if (value instanceof Map) {
    value.forEach((entry, key) => {
      visitObjectGraph(key, seen, visit);
      visitObjectGraph(entry, seen, visit);
    });
    return;
  }
  if (value instanceof Set) {
    value.forEach((entry) => visitObjectGraph(entry, seen, visit));
    return;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) visitObjectGraph(descriptor.value, seen, visit);
  }
}
