import { SearError } from '@searsuite/sear-foundation-error';
import { type NodeSchema, type RichDocOTOperationPath } from './RichDocOTOperations';

export function resolveRichDocParent(root: NodeSchema, path: RichDocOTOperationPath): NodeSchema {
  let node = root;
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index];
    if (typeof key !== 'number' || !node.content?.[key]) throw new SearError(`Invalid RichDoc path: ${path.join('.')}`);
    node = node.content[key];
  }
  return node;
}

export function isStrictRichDocPathPrefix(prefix: RichDocOTOperationPath, path: RichDocOTOperationPath): boolean {
  if (prefix.length >= path.length) return false;
  for (let index = 0; index < prefix.length; index++) if (prefix[index] !== path[index]) return false;
  return true;
}

export function haveSameRichDocParent(left: RichDocOTOperationPath, right: RichDocOTOperationPath): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length - 1; index++) if (left[index] !== right[index]) return false;
  return true;
}
