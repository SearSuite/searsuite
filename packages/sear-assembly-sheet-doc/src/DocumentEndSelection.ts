import type { DocSelection } from '@searsuite/sear-domain-doc';
import type { Schema } from '@searsuite/sear-domain-doc-schema';

/** Creates the initial caret at the end of the last text leaf. */
export function createDocumentEndSelection(document: readonly Schema[]): DocSelection {
  let last: { path: number[]; offset: number } | null = null;

  function visit(nodes: readonly Schema[], parentPath: number[]): void {
    nodes.forEach((node, index) => {
      const path = [...parentPath, index];
      if (typeof node.text === 'string') last = { path, offset: node.text.length };
      if (Array.isArray(node.content)) visit(node.content, path);
    });
  }

  visit(document, []);
  const position = last ?? { path: [0, 0], offset: 0 };
  return { anchor: position, head: { path: [...position.path], offset: position.offset } };
}
