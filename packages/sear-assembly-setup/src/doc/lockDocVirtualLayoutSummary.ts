import { type DocVirtualLayoutSummary } from '../index';

const lockedValues = new WeakSet<object>();

/** Locks a completed render summary before it reaches plugin observers. */
export function lockDocVirtualLayoutSummary(summary: DocVirtualLayoutSummary): DocVirtualLayoutSummary {
  const visiting = new WeakSet<object>();
  function lock(value: unknown): void {
    if (value === null || typeof value !== 'object' || lockedValues.has(value) || visiting.has(value)) return;
    visiting.add(value);
    for (const child of Object.values(value)) lock(child);
    Object.freeze(value);
    lockedValues.add(value);
  }
  lock(summary);
  return summary;
}
