import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { SearError } from '@searsuite/sear-foundation-error';
import { Rect } from '@searsuite/sear-foundation-rect';
import { lockCommittedPluginState } from './lockCommittedPluginState';

const adoptedValues = new WeakSet<object>();

/** Takes ownership of committed data without retaining extension-owned matrix instances. */
export function adoptCommittedPluginState<T>(state: T): T {
  lockCommittedPluginState(state);
  return detachMatrices(state, new WeakMap<object, unknown>(), new WeakSet<object>());
}

function detachMatrices<T>(value: T, copies: WeakMap<object, unknown>, visiting: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') return value;
  if (adoptedValues.has(value)) return value;
  if (visiting.has(value)) throw new SearError('Committed plugin state cannot contain cycles.');
  if (copies.has(value)) return copies.get(value) as T;
  if (value instanceof CSRMatrix) {
    visiting.add(value);
    const copy = CSRMatrix.prototype.cloneCommittedView.call(value, (extra) =>
      detachMatrices(extra, copies, visiting),
    ) as T;
    visiting.delete(value);
    copies.set(value, copy);
    adoptedValues.add(copy as object);
    return copy;
  }
  if (Object.getPrototypeOf(value) === Rect.prototype) {
    const copy = Rect.prototype.clone.call(value) as T;
    Rect.prototype.lockMutations.call(copy);
    copies.set(value, copy);
    adoptedValues.add(copy as object);
    return copy;
  }
  visiting.add(value);

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  copies.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    Object.defineProperty(copy, key, {
      ...descriptor,
      value: detachMatrices(descriptor.value, copies, visiting),
    });
  }
  visiting.delete(value);
  Object.freeze(copy);
  adoptedValues.add(copy);
  return copy as T;
}
