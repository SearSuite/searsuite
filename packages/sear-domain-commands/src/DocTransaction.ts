import {
  RichDocOTActionName,
  type RichDocOTOperation,
  type NodeSchema,
  type UpdateAttrsOTOperation,
} from '@searsuite/sear-domain-ot';
import {
  type DocSelection,
  type DocCursorPos,
  type RichDocNode,
  buildInlineTextRangePatchPlan,
  createInlineTextStyleAttrsPatcher,
  mapInlineTextRangePatchCursor,
  type InlineTextRangeAttrsPatcher,
} from '@searsuite/sear-domain-doc';
import { type DocStep } from './DocStep';

/** Render pipeline effect declared by a document command transaction. */
export enum DocTransactionRenderOperationType {
  Reflow = 'reflow',
  Repaint = 'repaint',
}

/** Returns whether two numeric rich-document paths address the same node. */
function pathEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Repositions a cursor after text is inserted into the same text node. */
function mapCursorForInsertText(
  cursor: DocCursorPos,
  insertPath: number[],
  insertOffset: number,
  textLen: number,
): DocCursorPos {
  if (pathEquals(cursor.path, insertPath) && cursor.offset >= insertOffset) {
    return { path: cursor.path, offset: cursor.offset + textLen };
  }
  return cursor;
}

/** Repositions a cursor after text is deleted from the same text node. */
function mapCursorForDeleteText(
  cursor: DocCursorPos,
  deletePath: number[],
  deleteOffset: number,
  deleteLen: number,
): DocCursorPos {
  if (pathEquals(cursor.path, deletePath)) {
    if (cursor.offset >= deleteOffset + deleteLen) {
      return { path: cursor.path, offset: cursor.offset - deleteLen };
    }
    if (cursor.offset > deleteOffset) {
      return { path: cursor.path, offset: deleteOffset };
    }
  }
  return cursor;
}

/**
 * Builder for rich-document command transactions.
 *
 * Commands append document OT steps and selection mapping metadata here. The
 * caller later applies the steps through the editor pipeline.
 */
export class DocTransaction {
  /** Ordered steps produced by the command. */
  public readonly steps: DocStep[] = [];
  /** Command metadata consumed by the document editor host. */
  public readonly meta: Record<string, unknown> = {};
  /** Render pipeline effect produced by this document transaction. */
  public readonly renderOperationType: DocTransactionRenderOperationType = DocTransactionRenderOperationType.Reflow;

  /**
   * Appends a prepared document step.
   * @param step - Step to run during transaction application.
   * @returns The current transaction for chaining.
   */
  public addStep(step: DocStep): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Stores command metadata.
   * @param key - Metadata key.
   * @param value - Metadata value.
   * @returns The current transaction for chaining.
   */
  public setMeta(key: string, value: unknown): this {
    this.meta[key] = value;
    return this;
  }

  /**
   * Reads command metadata by key.
   * @param key - Metadata key.
   * @returns The stored value when present.
   */
  public getMeta<T>(key: string): T | undefined {
    return this.meta[key] as T | undefined;
  }

  /**
   * Appends a text insertion step.
   * @param path - Path to the text node.
   * @param offset - String offset where text is inserted.
   * @param text - Text to insert.
   * @returns The current transaction for chaining.
   */
  public insertText(path: number[], offset: number, text: string): this {
    const op: RichDocOTOperation = {
      p: [...path, offset],
      [RichDocOTActionName.StringInsert]: text,
    } as RichDocOTOperation;

    const insertPath = path;
    const insertOffset = offset;
    const textLen = text.length;

    this.addStep({
      ops: [op],
      mapSelection(sel) {
        return {
          anchor: mapCursorForInsertText(sel.anchor, insertPath, insertOffset, textLen),
          head: mapCursorForInsertText(sel.head, insertPath, insertOffset, textLen),
        };
      },
    });
    return this;
  }

  /**
   * Appends a text deletion step.
   * @param path - Path to the text node.
   * @param offset - String offset where deletion starts.
   * @param text - Exact text expected to be deleted.
   * @returns The current transaction for chaining.
   */
  public deleteText(path: number[], offset: number, text: string): this {
    const op: RichDocOTOperation = {
      p: [...path, offset],
      [RichDocOTActionName.StringDelete]: text,
    } as RichDocOTOperation;

    const deletePath = path;
    const deleteOffset = offset;
    const deleteLen = text.length;

    this.addStep({
      ops: [op],
      mapSelection(sel) {
        return {
          anchor: mapCursorForDeleteText(sel.anchor, deletePath, deleteOffset, deleteLen),
          head: mapCursorForDeleteText(sel.head, deletePath, deleteOffset, deleteLen),
        };
      },
    });
    return this;
  }

  /**
   * Appends a node insertion step.
   * @param path - Target insertion path.
   * @param node - Node payload to insert.
   * @returns The current transaction for chaining.
   */
  public insertNode(path: number[], node: NodeSchema): this {
    const op: RichDocOTOperation = {
      p: path,
      [RichDocOTActionName.NodeInsert]: node,
    } as RichDocOTOperation;

    this.addStep({
      ops: [op],
      mapSelection(sel) {
        return sel;
      },
    });
    return this;
  }

  /**
   * Appends a node deletion step.
   * @param path - Path of the node to delete.
   * @param nodeSnapshot - Deleted node payload used for OT inversion.
   * @returns The current transaction for chaining.
   */
  public deleteNode(path: number[], nodeSnapshot: NodeSchema): this {
    const op: RichDocOTOperation = {
      p: path,
      [RichDocOTActionName.NodeDelete]: nodeSnapshot,
    } as RichDocOTOperation;

    this.addStep({
      ops: [op],
      mapSelection(sel) {
        return sel;
      },
    });
    return this;
  }

  /** Appends one attribute update operation and retains its previous value for inversion. */
  public updateAttrs(path: number[], key: string, value: unknown, prev: unknown): this {
    const op: UpdateAttrsOTOperation = {
      p: [...path, key],
      [RichDocOTActionName.UpdateAttrs]: { value, prev },
    };
    this.addStep({
      ops: [op],
      mapSelection(sel) {
        return sel;
      },
    });
    return this;
  }

  /** Applies one inline text-style property to the selected range using RichDoc OT operations. */
  public setInlineTextStyle(
    doc: RichDocNode[],
    selection: DocSelection,
    property: string,
    value: unknown | null,
    patchAttrs: InlineTextRangeAttrsPatcher = createInlineTextStyleAttrsPatcher(property, value),
  ): this {
    const patches = buildInlineTextRangePatchPlan(doc, selection, patchAttrs);
    if (patches.length === 0) return this;

    const operations: RichDocOTOperation[] = [];
    for (const patch of patches) {
      const [firstReplacement, ...remainingReplacement] = patch.replacement;
      const nextTextStyle = firstReplacement?.attrs?.['textStyle'];
      if (
        patch.wholeNode &&
        patch.replacement.length === 1 &&
        value !== null &&
        value !== void 0 &&
        firstReplacement &&
        hasOnlyTextStyleAttrChange(patch.oldNode.attrs, firstReplacement.attrs)
      ) {
        this.updateAttrs(
          [patch.blockIndex, patch.childIndex],
          'textStyle',
          nextTextStyle,
          patch.oldNode.attrs['textStyle'],
        );
        continue;
      }

      operations.push({
        p: [patch.blockIndex, patch.childIndex],
        [RichDocOTActionName.NodeDelete]: patch.oldNode,
        [RichDocOTActionName.NodeInsert]: firstReplacement,
      } as RichDocOTOperation);
      remainingReplacement.forEach((node, replacementIndex) => {
        operations.push({
          p: [patch.blockIndex, patch.childIndex + replacementIndex + 1],
          [RichDocOTActionName.NodeInsert]: node,
        } as RichDocOTOperation);
      });
    }

    if (operations.length > 0) {
      this.addStep({
        ops: operations,
        mapSelection(sel) {
          return {
            anchor: mapInlineTextRangePatchCursor(sel.anchor, patches),
            head: mapInlineTextRangePatchCursor(sel.head, patches),
          };
        },
      });
    }
    return this;
  }

  /**
   * Appends a selection-only step.
   * @param sel - Selection that should be active after this transaction.
   * @returns The current transaction for chaining.
   */
  public setSelection(sel: DocSelection): this {
    this.addStep({
      ops: [],
      mapSelection() {
        return sel;
      },
    });
    return this;
  }
}

function hasOnlyTextStyleAttrChange(
  previousAttrs: Record<string, unknown>,
  nextAttrs: Record<string, unknown>,
): boolean {
  const keys = new Set([...Object.keys(previousAttrs), ...Object.keys(nextAttrs)]);
  keys.delete('textStyle');
  for (const key of keys) {
    if (previousAttrs[key] !== nextAttrs[key]) return false;
  }
  return true;
}
