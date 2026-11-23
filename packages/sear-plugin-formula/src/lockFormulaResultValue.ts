import { type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { SearError } from '@searsuite/sear-foundation-error';

const lockedValues = new WeakSet<object>();

/** Locks a calculated value once when it enters the editor-local result cache. */
export function lockFormulaResultValue(value: FormulaValue): void {
  if (!value || typeof value !== 'object') return;
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || lockedValues.has(current)) continue;
    const prototype = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) {
      throw new SearError('Formula result values must contain plain data.');
    }
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor) continue;
      if (!('value' in descriptor)) throw new SearError('Formula results cannot contain accessors.');
      pending.push(descriptor.value);
    }
    Object.freeze(current);
    lockedValues.add(current);
  }
}
