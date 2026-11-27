import type { DocSelection } from '@searsuite/sear-domain-doc';

/** Returns a detached copy of a runtime selection for boundary hand-off. */
export function cloneSelection(selection: DocSelection): DocSelection {
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}

/** Converts a contract selection into the numeric path used by SearCoreDoc. */
export function toDocSelection(selection: {
  readonly anchor: { readonly path: readonly (number | string)[]; readonly offset: number };
  readonly head: { readonly path: readonly (number | string)[]; readonly offset: number };
}): DocSelection {
  return {
    anchor: { path: selection.anchor.path.map(toNumber), offset: selection.anchor.offset },
    head: { path: selection.head.path.map(toNumber), offset: selection.head.offset },
  };
}

function toNumber(value: number | string): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
}
