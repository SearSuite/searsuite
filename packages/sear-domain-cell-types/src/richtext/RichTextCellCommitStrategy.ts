import { DocNodeRegistry, isTextNode, type RichDocNode } from '@searsuite/sear-domain-doc';
import { CellCommitContext, CellCommitStrategy } from '../CellCommitStrategy';
import { type CellMatrixElement } from '../CellMatrixElement';
import { CellType } from '../CellType';

/** Persists the document tree only when it contains durable inline/block semantics. */
export class RichTextCellCommitStrategy extends CellCommitStrategy {
  /** Stable identifier for the rich-text strategy. */
  readonly key = CellType.RichText;
  // Rich-document attributes and non-text nodes remain meaningful even when
  // their plain-text projection is empty, so this must precede empty-cell
  // cleanup in the commit strategy order.
  /** Ordering priority for rich-text input. */
  readonly priority = 110;

  /** Reports whether the input is a rich-document snapshot. */
  matches(context: CellCommitContext): boolean {
    return RichTextCellCommitStrategy.hasPersistentRichText(context.richText);
  }

  /** Persists a cloned rich-document snapshot. */
  commit(context: CellCommitContext): CellMatrixElement {
    return {
      type: CellType.RichText,
      value: JSON.parse(JSON.stringify(context.richText)),
    };
  }

  private static hasPersistentRichText(nodes: RichDocNode[]): boolean {
    return Array.isArray(nodes) && nodes.some((node) => RichTextCellCommitStrategy.hasPersistentRichDocumentNode(node));
  }

  private static hasPersistentRichDocumentNode(node: RichDocNode): boolean {
    if (!node || typeof node !== 'object') return false;
    if (Object.keys(node.attrs ?? {}).length > 0) return true;
    if (!DocNodeRegistry.isBlockType(node.type) && !isTextNode(node)) return true;
    // Text nodes are leaves in the rich-document schema.  `content` is
    // optional on both leaves and legacy paragraph data, so recursion must be
    // guarded rather than assuming every node owns an array.
    return (
      Array.isArray(node.content) &&
      node.content.some((child) => RichTextCellCommitStrategy.hasPersistentRichDocumentNode(child))
    );
  }
}
