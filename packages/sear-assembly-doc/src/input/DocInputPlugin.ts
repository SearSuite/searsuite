import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';

import {
  deleteBackwardCommand,
  DocTransaction,
  inputCommand,
  moveCursorCommand,
  selectAllCommand,
  splitParagraphCommand,
  type DocCommand,
  type DocCursorDirection,
  type DocStep,
} from '@searsuite/sear-domain-commands';
import { cloneRichDocument, DocNodeRegistry, DocSelection, RichDocNode } from '@searsuite/sear-domain-doc';
import { DocLayoutEngine, LayoutSnapshot, lockLayoutSnapshot } from '@searsuite/sear-domain-editor';
import {
  RichDocOT,
  RichDocOTActionName,
  RichDocTransactionOT,
  RichDocTransactionOTRelation,
  type NodeSchema,
  type RichDocOTOperation,
} from '@searsuite/sear-domain-ot';

import { runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';
import { Platform } from '@searsuite/sear-foundation-platform';
import { adoptCommittedDocInputState } from './lockCommittedDocInputState';

/** Transaction metadata key containing selection mapping for DocInputPlugin. */
export const DocInputTransactionMeta = {
  /** Ordered selection mapping steps produced by a rich-document command. */
  Steps: 'docInput.steps',
  /** Preferred x-position after cursor navigation. */
  PreferredX: 'docInput.preferredX',
  /** Whether the command changed selection only. */
  SelectionOnly: 'docInput.selectionOnly',
  /** Replacement selection payload for whole-session document commands. */
  ReplaceSelection: 'docInput.replaceSelection',
  /** Inline style keys changed by a semantic document command. */
  ChangedInlineStyles: 'docInput.changedInlineStyles',
} as const;

type DocInputTransactionStep = Pick<DocStep, 'mapSelection'>;

/** State for an active rich-document input session. */
export interface DocInputState {
  /** Pending document content owned by the current edit session. */
  pendingDoc: RichDocNode[];
  /** Current rich-document selection. */
  docSelection: DocSelection;
  /** Preferred x-position for repeated vertical cursor movement. */
  preferredX: number | null;
}

/** Result of applying one domain input command to the active document input session. */
export interface DocInputDispatchResult {
  /** Selection after all command steps have been applied and mapped. */
  readonly selection: DocSelection;
  /** Whether the command only changed selection/caret state. */
  readonly selectionOnly: boolean;
  /** Whether the command produced document OT operations. */
  readonly contentChanged: boolean;
}

/** Plugin that applies rich-document text input and cursor navigation commands. */
@Injectable()
export class DocInputPlugin extends Plugin<DocInputState> {
  readonly #nodes: DocNodeRegistry;
  readonly #docLayoutEngine: DocLayoutEngine;
  readonly #platform: Platform | undefined;

  /** DI token for resolving the document input plugin. */
  public static readonly symbol: symbol = Symbol.for('DocInputPlugin');
  /** Stable plugin key for document input state. */
  public static readonly pluginKey: PluginKey = new PluginKey('DocInput');
  /** All document data mutations use the shared RichDoc OT operation family. */
  public override readonly transactionOT = {
    ownerId: 'doc.input',
    definition: RichDocTransactionOT,
    relations: [RichDocTransactionOTRelation],
  } as const;
  readonly #documentListeners = new Set<() => void>();
  readonly #selectionListeners = new Set<() => void>();
  #lastSnapshot: LayoutSnapshot | null = null;
  #isCommandExecuting: (() => boolean) | null = null;
  #runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution;
  #stateCommitToken: object | null = null;
  #restorationSealed = false;

  /** Constructs the document input plugin with editor-session state only. */
  constructor(
    @Inject(DocLayoutEngine.symbol)
    docLayoutEngine: DocLayoutEngine,
    @Inject(DocNodeRegistry.symbol) nodes: DocNodeRegistry,
    @Inject(Platform.symbol)
    platform?: Platform,
  ) {
    super({
      key: DocInputPlugin.pluginKey,
      state: {
        pendingDoc: [],
        docSelection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
        preferredX: null,
      },
    });
    this.#docLayoutEngine = docLayoutEngine;
    this.#platform = platform;
    this.#nodes = nodes;
  }

  /** Binds the owning editor's command and commit boundary after initial state registration. */
  public enforceSessionWriteBoundary(
    isCommandExecuting: () => boolean,
    commitToken: object,
    runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution,
  ): void {
    if (this.#stateCommitToken) throw new SearError('Doc input write boundary is already installed.');
    Plugin.prototype.enforceStateWriteBoundary.call(this, commitToken);
    this.#isCommandExecuting = isCommandExecuting;
    this.#runWithoutMutationAuthority = runWithoutMutationAuthority;
    this.#stateCommitToken = commitToken;
    Plugin.prototype.setState.call(this, adoptCommittedDocInputState(this.getState()), commitToken);
  }

  /** Closes the document initialization and session restoration phase. */
  public sealSessionRestoration(): void {
    this.#restorationSealed = true;
  }

  /** Registers document input state under the plugin key. */
  public registerState() {
    return { key: this.pluginKey, state: this.getState() };
  }

  /** Applies rich-document OT transactions owned by the document input plugin. */
  public apply(state: DocInputState, transaction: Transaction): DocInputState | null {
    if (transaction.pluginKey?.key !== this.pluginKey.key) return null;
    const nextState: DocInputState = {
      pendingDoc: state.pendingDoc,
      docSelection: state.docSelection,
      preferredX: state.preferredX,
    };

    if (transaction.operations.length > 0) {
      const root = {
        type: 'doc' as const,
        content: cloneRichDocument(nextState.pendingDoc),
      } as NodeSchema;
      const newRoot = RichDocOT.apply(root, transaction.operations as never);
      nextState.pendingDoc = Array.isArray(newRoot.content)
        ? newRoot.content.map((schema) => this.#nodes.create(schema))
        : [];
    }

    const steps = transaction.getMeta<DocInputTransactionStep[]>(DocInputTransactionMeta.Steps) ?? [];
    let selection = nextState.docSelection;
    for (const step of steps) {
      selection = step.mapSelection(selection, nextState.pendingDoc);
    }
    const explicitSelection = transaction.getMeta<DocSelection>(DocInputTransactionMeta.ReplaceSelection);
    if (explicitSelection) selection = explicitSelection;
    nextState.docSelection = this.#stateCommitToken ? cloneSelection(selection) : selection;

    const preferredX = transaction.getMeta<number | null>(DocInputTransactionMeta.PreferredX);
    nextState.preferredX = preferredX !== void 0 ? preferredX ?? null : null;

    return nextState;
  }

  /** Current document input session state. */
  public get session(): DocInputState {
    return this.getState();
  }

  /** Returns the derived layout snapshot used for vertical cursor movement. */
  public getLastSnapshot(): LayoutSnapshot | null {
    return this.#lastSnapshot;
  }

  /** Publishes committed document and selection projections after Core commits this plugin's transaction. */
  public onTransactionCommitted(transaction: Transaction): void {
    if (transaction.pluginKey?.key !== this.pluginKey.key) return;
    const documentChanged = transaction.operations.length > 0;
    if (documentChanged) this.#notifyDocumentListeners();
    this.#notifySelectionListeners();
  }

  /** Subscribes to committed document projection changes. */
  public subscribeDocument(listener: () => void): () => void {
    this.#documentListeners.add(listener);
    return () => this.#documentListeners.delete(listener);
  }

  /** Subscribes to committed selection projection changes. */
  public subscribeSelection(listener: () => void): () => void {
    this.#selectionListeners.add(listener);
    return () => this.#selectionListeners.delete(listener);
  }

  /** Replaces local selection during session restoration without changing document content. */
  public restoreSelection(selection: DocSelection): void {
    this.#replaceSessionState({ ...this.getState(), docSelection: cloneSelection(selection), preferredX: null });
    this.#notifySelectionListeners();
  }

  /** Replaces the current edit session document and selection. */
  public resetSession(doc: RichDocNode[], selection?: DocSelection): void {
    this.#assertDocumentRestorationOpen();
    const pendingDoc = this.#stateCommitToken ? cloneRichDocument(doc).map((node) => this.#nodes.create(node)) : doc;
    const docSelection = selection ?? {
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    };
    this.#replaceSessionState({
      pendingDoc,
      docSelection: this.#stateCommitToken ? cloneSelection(docSelection) : docSelection,
      preferredX: null,
    });
    this.#lastSnapshot = null;
    this.#notifyDocumentListeners();
    this.#notifySelectionListeners();
  }

  /** Clears the current edit session state. */
  public clearSession(): void {
    this.#assertDocumentRestorationOpen();
    this.#replaceSessionState({
      pendingDoc: [],
      docSelection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 0 },
      },
      preferredX: null,
    });
    this.#lastSnapshot = null;
  }

  #notifyDocumentListeners(): void {
    this.#runWithoutMutationAuthority(() =>
      this.#documentListeners.forEach((listener) => {
        try {
          listener();
        } catch (error) {
          this.#platform?.warn('Doc document listener failed.', error);
        }
      }),
    );
  }

  #notifySelectionListeners(): void {
    this.#runWithoutMutationAuthority(() =>
      this.#selectionListeners.forEach((listener) => {
        try {
          listener();
        } catch (error) {
          this.#platform?.warn('Doc selection listener failed.', error);
        }
      }),
    );
  }

  /** Stores the last layout snapshot for cursor navigation. */
  public setLastSnapshot(snapshot: LayoutSnapshot | null): void {
    if (this.#stateCommitToken && this.#restorationSealed && !this.#isCommandExecuting?.()) {
      throw new SearError('Doc layout changes must run through editor.commands.run(...).');
    }
    this.#lastSnapshot = snapshot ? lockLayoutSnapshot(snapshot) : null;
  }

  #assertDocumentRestorationOpen(): void {
    if (this.#stateCommitToken && this.#restorationSealed) {
      throw new SearError(
        'Assembled Doc content must change through editor.commands.run(...) with a RichDocOT transaction.',
      );
    }
  }

  /** Builds a workspace transaction from a rich-document domain command. */
  public createTransaction(command: DocCommand, docTransaction: DocTransaction = new DocTransaction()): Transaction {
    const tr = command(docTransaction, { ...this.getState(), lastSnapshot: this.#lastSnapshot, nodes: this.#nodes });
    const transaction = createTransaction(this.pluginKey);
    transaction.addOperation(tr.steps.flatMap((s) => s.ops) as never);
    transaction.setMeta(
      DocInputTransactionMeta.Steps,
      tr.steps.map((step) => ({ mapSelection: step.mapSelection })),
    );
    transaction.setMeta(DocInputTransactionMeta.PreferredX, tr.getMeta<number | null>('preferredX'));
    transaction.setMeta(DocInputTransactionMeta.SelectionOnly, tr.getMeta<boolean>('selectionOnly') === true);
    transaction.setMeta(
      DocInputTransactionMeta.ChangedInlineStyles,
      tr.getMeta<readonly string[]>('doc.changedInlineStyles'),
    );

    return transaction;
  }

  /** Builds a transaction for committed text input. */
  public createInputTransaction(text: string): Transaction {
    return this.createTransaction(inputCommand(text));
  }

  /** Builds a transaction for soft-enter paragraph splitting. */
  public createSoftEnterTransaction(): Transaction {
    return this.createTransaction(splitParagraphCommand());
  }

  /** Builds a transaction for Backspace deletion. */
  public createDeleteTransaction(): Transaction {
    return this.createTransaction(deleteBackwardCommand());
  }

  /** Builds a transaction that selects all content in the current document session. */
  public createSelectAllTransaction(): Transaction {
    return this.createTransaction(selectAllCommand());
  }

  /** Builds a RichDoc OT transaction that replaces the active document session. */
  public createReplaceDocumentTransaction(document: RichDocNode[], selection?: DocSelection): Transaction {
    const transaction = createTransaction(this.pluginKey);
    const operations: RichDocOTOperation[] = [];
    for (let index = this.session.pendingDoc.length - 1; index >= 0; index--) {
      operations.push({
        p: [index],
        [RichDocOTActionName.NodeDelete]: this.session.pendingDoc[index],
      } as RichDocOTOperation);
    }
    document.forEach((node, index) => {
      operations.push({
        p: [index],
        [RichDocOTActionName.NodeInsert]: node,
      } as RichDocOTOperation);
    });
    transaction.addOperation(operations);
    transaction.setMeta(
      DocInputTransactionMeta.ReplaceSelection,
      selection ?? {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 0 },
      },
    );
    return transaction;
  }

  /** Builds a transaction for arrow-key cursor navigation. */
  public createArrowTransaction(direction: DocCursorDirection, shiftKey: boolean): Transaction {
    return this.createTransaction(moveCursorCommand(direction, shiftKey, this.#docLayoutEngine));
  }

  #applyLocalTransaction(transaction: Transaction): DocInputDispatchResult {
    if (this.#stateCommitToken) {
      throw new SearError('Assembled Doc input must commit through the editor command pipeline.');
    }
    const nextState = this.apply(this.getState(), transaction);
    if (nextState) this.setState(nextState);
    return {
      selection: this.session.docSelection,
      selectionOnly: transaction.getMeta<boolean>(DocInputTransactionMeta.SelectionOnly) === true,
      contentChanged: transaction.operations.length > 0,
    };
  }

  /** Handles committed text input. */
  public handleInput(text: string): DocInputDispatchResult {
    return this.#applyLocalTransaction(this.createInputTransaction(text));
  }

  /** Handles soft-enter paragraph splitting. */
  public handleSoftEnter(): DocInputDispatchResult {
    return this.#applyLocalTransaction(this.createSoftEnterTransaction());
  }

  /** Handles Backspace deletion. */
  public handleDelete(): DocInputDispatchResult {
    return this.#applyLocalTransaction(this.createDeleteTransaction());
  }

  /** Selects all content in the current document session. */
  public handleSelectAll(): DocInputDispatchResult {
    return this.#applyLocalTransaction(this.createSelectAllTransaction());
  }

  /** Handles arrow-key cursor navigation. */
  public handleArrow(direction: DocCursorDirection, shiftKey: boolean): DocInputDispatchResult {
    return this.#applyLocalTransaction(this.createArrowTransaction(direction, shiftKey));
  }

  #replaceSessionState(state: DocInputState): void {
    if (this.#restorationSealed && this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Doc input session changes must run through editor.commands.run(...).');
    }
    Plugin.prototype.setState.call(
      this,
      this.#stateCommitToken ? adoptCommittedDocInputState(state) : state,
      this.#stateCommitToken ?? undefined,
    );
  }
}

function cloneSelection(selection: DocSelection): DocSelection {
  return {
    ...selection,
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}
