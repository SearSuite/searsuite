import type { RichDocNode, TextNode } from '@searsuite/sear-domain-doc';

/** Maps a plain-text offset back to the embedded editor's paragraph/text position. */
export function formulaDocumentPosition(document: readonly RichDocNode[], offset: number): {
  readonly path: readonly number[];
  readonly offset: number;
} {
  let remaining = Math.max(0, offset);
  for (let paragraphIndex = 0; paragraphIndex < document.length; paragraphIndex += 1) {
    const nodes = (document[paragraphIndex].content ?? []) as TextNode[];
    for (let textIndex = 0; textIndex < nodes.length; textIndex += 1) {
      const length = nodes[textIndex]?.text?.length ?? 0;
      if (remaining <= length) return { path: [paragraphIndex, textIndex], offset: remaining };
      remaining -= length;
    }
    if (paragraphIndex < document.length - 1) remaining -= 1;
  }
  const paragraphIndex = Math.max(0, document.length - 1);
  const nodes = (document[paragraphIndex]?.content ?? []) as TextNode[];
  const textIndex = Math.max(0, nodes.length - 1);
  return { path: [paragraphIndex, textIndex], offset: nodes[textIndex]?.text?.length ?? 0 };
}
