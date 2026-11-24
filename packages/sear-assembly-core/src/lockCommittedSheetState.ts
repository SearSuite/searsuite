import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { SearError } from '@searsuite/sear-foundation-error';
import { Rect } from '@searsuite/sear-foundation-rect';

const csrRuntimeFields = new Set<PropertyKey>([
  'data', 'indices', 'indptr', 'numRows', 'numCols', 'defaultValue', 'name', 'ndim', 'listeners',
]);

/** Locks document-owned state after initialization or a successful transaction commit. */
export function lockCommittedSheetState(state: unknown): void {
  lockCommittedPluginState(state);
}

/** Locks a plugin-owned committed value, including nested matrix state. */
export function lockCommittedPluginState(state: unknown): void {
  lockValue(state, new WeakSet<object>());
}

function lockValue(state: unknown, seen: WeakSet<object>): void {
  if (typeof state === 'function') throw new SearError('Committed plugin state cannot contain functions.');
  if (state === null || typeof state !== 'object') return;
  if (seen.has(state)) return;
  seen.add(state);
  if (state instanceof CSRMatrix) {
    CSRMatrix.prototype.lockMutations.call(state);
    for (const key of Reflect.ownKeys(state)) {
      if (csrRuntimeFields.has(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(state, key);
      if (!descriptor) continue;
      if (!('value' in descriptor)) throw new SearError('Committed plugin state cannot contain accessors.');
      if (key !== 'lockMutations' || typeof descriptor.value !== 'function') lockValue(descriptor.value, seen);
      Object.defineProperty(state, key, { writable: false, configurable: false });
    }
    return;
  }
  if (Object.getPrototypeOf(state) === Rect.prototype) {
    Rect.prototype.lockMutations.call(state);
    return;
  }
  const prototype = Object.getPrototypeOf(state);
  if (!Array.isArray(state) && prototype !== Object.prototype && prototype !== null) {
    throw new SearError('Committed plugin state requires plain data or a supported sparse value.');
  }
  lockOwnValues(state, seen);
  Object.freeze(state);
}

function lockOwnValues(state: object, seen: WeakSet<object>): void {
  for (const key of Reflect.ownKeys(state)) {
    const descriptor = Object.getOwnPropertyDescriptor(state, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw new SearError('Committed plugin state cannot contain accessors.');
    lockValue(descriptor.value, seen);
  }
}
