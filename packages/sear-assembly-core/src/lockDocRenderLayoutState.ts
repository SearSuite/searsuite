import { type DocRenderLayoutState } from './SearCoreDoc';

const lockedValues = new WeakSet<object>();

/** Locks the small frame projection at publication, keeping render reads allocation-free. */
export function lockDocRenderLayoutState(state: DocRenderLayoutState): DocRenderLayoutState {
  const visiting = new WeakSet<object>();
  function lock(value: unknown): void {
    if (value === null || typeof value !== 'object' || lockedValues.has(value) || visiting.has(value)) return;
    visiting.add(value);
    for (const child of Object.values(value)) lock(child);
    Object.freeze(value);
    lockedValues.add(value);
  }
  lock(state);
  return state;
}
