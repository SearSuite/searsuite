import { DocInputPlugin, DocInputTransactionMeta } from './DocInputPlugin';

import type { DocSelection } from '@searsuite/sear-domain-doc';
import { OTClone, RichDocOT, type RichDocOTOperation } from '@searsuite/sear-domain-ot';
import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';

interface EditHistoryEntry {
  operations: RichDocOTOperation[];
  before: DocSelection;
  after: DocSelection;
}

function cloneSelection(selection: DocSelection): DocSelection {
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}

/** OT history scoped to one active Sheet embedded-document edit session. */
export class DocEditHistory {
  readonly #input: DocInputPlugin;
  readonly #apply: (transaction: Transaction) => void;

  readonly #undoStack: EditHistoryEntry[] = [];
  readonly #redoStack: EditHistoryEntry[] = [];

  public constructor(input: DocInputPlugin, apply: (transaction: Transaction) => void) {
    this.#input = input;
    this.#apply = apply;
  }

  public getStatus(): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: this.#undoStack.length > 0, canRedo: this.#redoStack.length > 0 };
  }

  public record(transaction: Transaction, before: DocSelection, after: DocSelection): void {
    const operations = transaction.operations as RichDocOTOperation[];
    if (!operations.length || transaction.getMeta<boolean>(DocInputTransactionMeta.SelectionOnly)) return;
    this.#undoStack.push({
      operations: OTClone(operations),
      before: cloneSelection(before),
      after: cloneSelection(after),
    });
    if (this.#undoStack.length > 100) this.#undoStack.shift();
    this.#redoStack.length = 0;
  }

  public undo(): boolean {
    return this.#replay('undo', this.#undoStack, this.#redoStack);
  }

  public redo(): boolean {
    return this.#replay('redo', this.#redoStack, this.#undoStack);
  }

  public mergeLastTwo(): void {
    if (this.#undoStack.length < 2) return;
    const later = this.#undoStack.pop()!;
    const earlier = this.#undoStack[this.#undoStack.length - 1];
    earlier.operations.push(...later.operations);
    earlier.after = later.after;
  }

  #replay(action: 'undo' | 'redo', source: EditHistoryEntry[], destination: EditHistoryEntry[]): boolean {
    const entry = source[source.length - 1];
    if (!entry) return false;
    const selection = action === 'undo' ? entry.before : entry.after;
    const operations = action === 'undo' ? RichDocOT.invert(OTClone(entry.operations)) : OTClone(entry.operations);
    const transaction = createTransaction(DocInputPlugin.pluginKey, operations).setMeta(
      DocInputTransactionMeta.ReplaceSelection,
      cloneSelection(selection),
    );
    this.#apply(transaction);
    source.pop();
    destination.push(entry);
    return true;
  }
}
