import { type RichDocNode } from './RichDocNode';

/** Returns a detached mutable snapshot of a rich document. */
export function cloneRichDocument(document: readonly RichDocNode[]): RichDocNode[] {
  return JSON.parse(JSON.stringify(document)) as RichDocNode[];
}
