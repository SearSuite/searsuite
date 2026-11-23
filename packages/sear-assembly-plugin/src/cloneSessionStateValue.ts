import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { Rect } from '@searsuite/sear-foundation-rect';
import { SessionStateError, SessionStateErrorCode } from './SessionStateError';

/** Copies a session snapshot without trusting extension-provided clone hooks. */
export function cloneSessionStateValue<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>());
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') throw unsupportedSnapshot();
    return value;
  }
  if (seen.has(value)) return seen.get(value) as T;

  if (value instanceof Transaction) {
    const copy = createTransaction(value.pluginKey, cloneValue(value.operations, seen), cloneValue(value.meta, seen));
    seen.set(value, copy);
    return copy as T;
  }
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    seen.set(value, copy);
    return copy as T;
  }
  if (value instanceof Rect && Object.getPrototypeOf(value) === Rect.prototype) {
    const copy = Rect.prototype.clone.call(value);
    seen.set(value, copy);
    return copy as T;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    value.forEach((entry) => copy.push(cloneValue(entry, seen)));
    return copy as T;
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    seen.set(value, copy);
    value.forEach((entry, key) => copy.set(cloneValue(key, seen), cloneValue(entry, seen)));
    return copy as T;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    seen.set(value, copy);
    value.forEach((entry) => copy.add(cloneValue(entry, seen)));
    return copy as T;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unsupportedSnapshot();
  const copy = Object.create(prototype) as Record<PropertyKey, unknown>;
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw unsupportedSnapshot();
    Object.defineProperty(copy, key, {
      ...descriptor,
      value: cloneValue(descriptor.value, seen),
    });
  }
  return copy as T;
}

function unsupportedSnapshot(): SessionStateError {
  return new SessionStateError(
    SessionStateErrorCode.snapshotNotDetached,
    'Session state values must be detached plain data or supported built-in values.',
  );
}
