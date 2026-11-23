import { type LayoutSnapshot } from './DocLayoutEngine';

const lockedValues = new WeakSet<object>();

/** Locks a completed layout so readers cannot change cursor or render geometry. */
export function lockLayoutSnapshot(snapshot: LayoutSnapshot): LayoutSnapshot {
  const visiting = new WeakSet<object>();
  function lock(value: unknown): void {
    if (value === null || typeof value !== 'object' || lockedValues.has(value) || visiting.has(value)) return;
    visiting.add(value);
    for (const child of Object.values(value)) lock(child);
    Object.freeze(value);
    lockedValues.add(value);
  }
  lock(snapshot);
  return snapshot;
}
