import { SearError } from '@searsuite/sear-foundation-error';
import { RichDocNode } from '@searsuite/sear-domain-doc';
import { type DocInputState } from './DocInputPlugin';

const lockedValues = new WeakSet<object>();
const adoptedValues = new WeakSet<object>();

/** Keeps retained document and selection handles immutable after a Doc input commit. */
export function lockCommittedDocInputState(state: DocInputState): void {
  lockValue(state, new WeakSet<object>());
}

/** Detaches subclass-private slots from committed nodes while reusing unchanged document data. */
export function adoptCommittedDocInputState(state: DocInputState): DocInputState {
  lockCommittedDocInputState(state);
  return detachNodeValues(state, new WeakMap<object, unknown>(), new WeakSet<object>());
}

function detachNodeValues<T>(value: T, copies: WeakMap<object, unknown>, visiting: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') return value;
  if (adoptedValues.has(value)) return value;
  if (copies.has(value)) return copies.get(value) as T;
  if (visiting.has(value)) throw new SearError('Committed document state cannot contain cycles.');
  const prototype = Object.getPrototypeOf(value);
  const isNode = value instanceof RichDocNode;
  if (!isNode && !Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new SearError('Committed document state requires nodes and plain data.');
  }
  visiting.add(value);

  const updates = new Map<PropertyKey, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    const detached = detachNodeValues(descriptor.value, copies, visiting);
    if (detached !== descriptor.value) updates.set(key, detached);
  }
  visiting.delete(value);
  const copy = Array.isArray(value) ? [] : Object.create(prototype);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    Object.defineProperty(copy, key, updates.has(key) ? { ...descriptor, value: updates.get(key) } : descriptor);
  }
  Object.freeze(copy);
  copies.set(value, copy);
  adoptedValues.add(copy);
  lockedValues.add(copy);
  return copy as T;
}

function lockValue(value: unknown, seen: WeakSet<object>): void {
  if (typeof value === 'function') throw new SearError('Committed document state cannot contain functions.');
  if (value === null || typeof value !== 'object' || seen.has(value) || lockedValues.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw new SearError('Committed document state cannot contain accessors.');
    lockValue(descriptor.value, seen);
  }
  Object.freeze(value);
  lockedValues.add(value);
}
