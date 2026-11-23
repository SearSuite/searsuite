import { SearError } from '@searsuite/sear-foundation-error';
import { DocInputPlugin, DocInputTransactionMeta, Pipeline, runOutsideCommandExecution } from '@searsuite/sear-assembly-core';
import {
  DocCommandBus,
  defineDocCommand,
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
} from '@searsuite/sear-assembly-commands';
import {
  PluginKey,
  SessionStateRestorePhase,
  defineSessionState,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { cloneRichDocument, type DocSelection, type RichDocNode } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';
import { DocTransactionRenderOperationType } from '@searsuite/sear-domain-commands';
import { OTClone, RichDocOT, type RichDocOTOperation } from '@searsuite/sear-domain-ot';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';

import {
  DocPlugin,
  type DocKeyboardHandlerRegistrationContext,
  type DocPluginRuntime,
  type DocPluginSetupContext,
} from '@searsuite/sear-assembly-doc';
import { DocContentRenderPluginKey } from '@searsuite/sear-assembly-doc';
import { DocSelectionSessionStateDefinition } from '../selection/SelectionPlugin';

/** Reverts the most recent committed document mutation. */
export const UndoDocCommand = defineDocCommand<void>('doc.undo');
/** Re-applies the most recently undone document mutation. */
export const RedoDocCommand = defineDocCommand<void>('doc.redo');

/** Current document undo/redo availability. */
export interface DocHistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** Detached before/after snapshots for one committed document mutation. */
export interface DocHistoryEntry {
  /** RichDoc OT operations committed by the document mutation. */
  readonly operations?: readonly RichDocOTOperation[];
  readonly beforeDocument: RichDocNode[];
  readonly beforeSelection: DocSelection;
  readonly afterDocument: RichDocNode[];
  readonly afterSelection: DocSelection;
}

/** Document-local undo and redo stacks retained during editor remounts. */
export interface DocHistorySessionState {
  readonly undoStack: readonly DocHistoryEntry[];
  readonly redoStack: readonly DocHistoryEntry[];
}

/** Stable session-state identity owned by document history. */
export const DocHistorySessionStateDefinition = defineSessionState<DocHistorySessionState>('doc.history');

/** Undo/redo availability exposed as an editor-local state observation. */
export const DocHistoryStatusObservation = defineStateObservation<DocHistoryStatus>('doc.history.status');

interface HistoryPluginState {
  undoStack: DocHistoryEntry[];
  redoStack: DocHistoryEntry[];
  lastDocument: RichDocNode[];
  lastSelection: DocSelection;
}

const HistoryActionMeta = 'doc.history.action';
const MaxHistoryEntries = 100;

/** Tracks committed document snapshots and contributes transaction-safe undo/redo commands. */
@Injectable()
export class HistoryPlugin extends DocPlugin<null> {
  /** DI token for resolving HistoryPlugin. */
  public static readonly symbol = Symbol.for('HistoryPlugin');

  private readonly listeners = new Set<(status: DocHistoryStatus) => void>();
  #runtime: DocPluginRuntime | null = null;
  #history: HistoryPluginState = {
    undoStack: [],
    redoStack: [],
    lastDocument: [],
    lastSelection: createDefaultSelection(),
  };
  #initialized = false;

  public constructor(
    @Inject(DocInputPlugin.symbol)
    private readonly input: DocInputPlugin,
    @Inject(Platform.symbol)
    private readonly platform?: Platform,
  ) {
    super({
      key: new PluginKey('DocHistory'),
      state: null,
    });
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(UndoDocCommand, () => this.createHistoryCommand('undo'));
    commands.register(RedoDocCommand, () => this.createHistoryCommand('redo'));
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(DocHistoryStatusObservation, {
      getSnapshot: this.getStatus.bind(this),
      subscribe: this.subscribe.bind(this),
    });
  }

  public registerSessionState(registry: SessionStateRegistry): void {
    if (this.#initialized) throw new SearError('Doc history session restoration is closed for this editor.');
    registry.register(DocHistorySessionStateDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      restoreAfter: [DocSelectionSessionStateDefinition],
      capture: this.#captureSessionState.bind(this),
      restore: this.#restoreSessionState.bind(this),
    });
  }

  /** Registers document undo and redo shortcuts with the composed keyboard adapter. */
  public configure(context: DocPluginSetupContext): void {
    if (this.#runtime || this.#initialized) throw new SearError('Doc history plugin is already configured.');
    this.#runtime = context.runtime;
  }

  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onUndo: () => void commands.run(UndoDocCommand, void 0),
      onRedo: () => void commands.run(RedoDocCommand, void 0),
    });
  }

  /** Aligns the history baseline with state restored before Core initialization. */
  public initialize(): void {
    if (this.#initialized) return;
    this.#initialized = true;
    const current = this.captureCurrentState();
    const state = this.#history;
    state.lastDocument = current.document;
    state.lastSelection = current.selection;
  }

  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#runtime = null;
    this.listeners.clear();
  }

  /** Updates history only after Core has committed the owning document transaction. */
  public onTransactionCommitted(transaction: Transaction): void {
    if (transaction.pluginKey?.key !== DocInputPlugin.pluginKey.key) return;
    if (!this.#requireRuntime().commands.isExecuting()) {
      throw new SearError('Doc history changes must run through editor.commands.run(...).');
    }
    const action = transaction.getMeta<'undo' | 'redo'>(HistoryActionMeta);
    const state = this.#history;
    const current = this.captureCurrentState();

    if (action === 'undo') {
      const entry = state.undoStack.pop();
      if (entry) state.redoStack.push(entry);
    } else if (action === 'redo') {
      const entry = state.redoStack.pop();
      if (entry) state.undoStack.push(entry);
    } else if (!documentsEqual(state.lastDocument, current.document)) {
      state.undoStack.push({
        operations: OTClone(transaction.operations as RichDocOTOperation[]),
        beforeDocument: cloneRichDocument(state.lastDocument),
        beforeSelection: cloneSelection(state.lastSelection),
        afterDocument: cloneRichDocument(current.document),
        afterSelection: cloneSelection(current.selection),
      });
      trimHistory(state.undoStack);
      state.redoStack.length = 0;
    }

    state.lastDocument = current.document;
    state.lastSelection = current.selection;
    this.emitStatus();
  }

  public getStatus(): DocHistoryStatus {
    const state = this.#history;
    return { canUndo: state.undoStack.length > 0, canRedo: state.redoStack.length > 0 };
  }

  public subscribe(listener: (status: DocHistoryStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public apply(_state: null, _transaction: Transaction): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<NodeProperties>[] | null {
    return null;
  }

  private createHistoryCommand(action: 'undo' | 'redo'): DocEditorCommand {
    const plugin = this;
    const id = action === 'undo' ? UndoDocCommand.id : RedoDocCommand.id;
    return {
      id,
      execute(_context: DocCommandContext): DocCommandResult {
        const pipeline = new Pipeline(id);
        const state = plugin.#history;
        const stack = action === 'undo' ? state.undoStack : state.redoStack;
        const entry = stack[stack.length - 1];
        if (!entry) return { pipeline };
        const document = action === 'undo' ? entry.beforeDocument : entry.afterDocument;
        const selection = action === 'undo' ? entry.beforeSelection : entry.afterSelection;
        const operations = entry.operations;
        const transaction =
          operations && operations.length > 0
            ? createTransaction(
                DocInputPlugin.pluginKey,
                action === 'undo' ? RichDocOT.invert([...operations]) : OTClone([...operations]),
              )
                .setMeta(DocInputTransactionMeta.ReplaceSelection, cloneSelection(selection))
                .setMeta(DocInputTransactionMeta.RenderOperation, DocTransactionRenderOperationType.Reflow)
            : plugin.input.createReplaceDocumentTransaction(cloneRichDocument(document), cloneSelection(selection));
        transaction.setMeta(HistoryActionMeta, action);
        pipeline.addTransaction(id, transaction);
        pipeline.addRender(`${id}:render`, DocContentRenderPluginKey);
        return { pipeline, effects: [{ type: 'reset-caret-blink' }] };
      },
    };
  }

  #captureSessionState(): DocHistorySessionState {
    const state = this.#history;
    return {
      undoStack: cloneHistoryStack(state.undoStack),
      redoStack: cloneHistoryStack(state.redoStack),
    };
  }

  #restoreSessionState(snapshot: DocHistorySessionState): void {
    if (this.#initialized) throw new SearError('Doc history session restoration is closed for this editor.');
    const current = this.captureCurrentState();
    this.#history = {
      undoStack: cloneHistoryStack(snapshot.undoStack).slice(-MaxHistoryEntries),
      redoStack: cloneHistoryStack(snapshot.redoStack).slice(-MaxHistoryEntries),
      lastDocument: current.document,
      lastSelection: current.selection,
    };
    this.emitStatus();
  }

  private captureCurrentState(): { document: RichDocNode[]; selection: DocSelection } {
    return {
      document: cloneRichDocument(this.input.session.pendingDoc),
      selection: cloneSelection(this.input.session.docSelection),
    };
  }

  private emitStatus(): void {
    const status = this.getStatus();
    runOutsideCommandExecution(() => this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (error) {
        this.platform?.warn('Doc history listener failed.', error);
      }
    }));
  }

  #requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError('HistoryPlugin is not configured.');
    return this.#runtime;
  }
}

function cloneHistoryStack(stack: readonly DocHistoryEntry[]): DocHistoryEntry[] {
  return stack.map((entry) => ({
    ...(entry.operations ? { operations: OTClone([...entry.operations]) } : {}),
    beforeDocument: cloneRichDocument(entry.beforeDocument),
    beforeSelection: cloneSelection(entry.beforeSelection),
    afterDocument: cloneRichDocument(entry.afterDocument),
    afterSelection: cloneSelection(entry.afterSelection),
  }));
}

function trimHistory(stack: DocHistoryEntry[]): void {
  if (stack.length > MaxHistoryEntries) stack.splice(0, stack.length - MaxHistoryEntries);
}

function documentsEqual(left: readonly RichDocNode[], right: readonly RichDocNode[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneSelection(selection: DocSelection): DocSelection {
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    head: { path: [...selection.head.path], offset: selection.head.offset },
  };
}

function createDefaultSelection(): DocSelection {
  return {
    anchor: { path: [0, 0], offset: 0 },
    head: { path: [0, 0], offset: 0 },
  };
}
