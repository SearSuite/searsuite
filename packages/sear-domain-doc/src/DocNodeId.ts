import { SearError } from '@searsuite/sear-foundation-error';

const docNodeIdBrand: unique symbol = Symbol('DocNodeId');

/** Stable identity used by document layout and retained render nodes. */
export type DocNodeId = string & { readonly [docNodeIdBrand]: true };

/** Creates a typed document node id from a non-empty string value. */
export function createDocNodeId(value: string): DocNodeId {
  const normalized = value.trim();
  if (!normalized) throw new SearError('DocNodeId cannot be empty.');
  return normalized as DocNodeId;
}

/** Creates a fallback document node id from a rich-document path. */
export function createDocNodeIdFromPath(path: readonly (number | string)[]): DocNodeId {
  return createDocNodeId(`path:${path.map(String).join('/')}`);
}

/** Resolves a block-level document id, preferring persisted node identity over path fallback. */
export function resolveDocNodeId(
  node: { readonly id?: string | undefined } | undefined,
  path: readonly (number | string)[],
): DocNodeId {
  return typeof node?.id === 'string' && node.id.trim() ? createDocNodeId(node.id) : createDocNodeIdFromPath(path);
}
