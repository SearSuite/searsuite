import { SearError } from '@searsuite/sear-foundation-error';

import {
  CommandExecutionPhase,
  createSheetTransaction,
  defineSheetCommand,
  LocalActionCommand,
  PipelineExecutionCommand,
  SheetCommandBus,
  type SheetCommandEvent,
  type SheetCommandResult,
} from '@searsuite/sear-assembly-commands';
import {
  defineSessionState,
  Pipeline,
  PipelineStepKind,
  Plugin,
  PluginKey,
  PluginManager,
  runOutsideCommandExecution,
  SessionStateRegistry,
  SessionStateRestorePhase,
  SheetInteractionStore,
} from '@searsuite/sear-assembly-plugin';
import { OTClone } from '@searsuite/sear-domain-ot';
import { Transaction, TRANSACTION_ORIGIN_META_KEY, TransactionOrigin } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

import { SheetExternalHistory } from '../SheetExternalHistory';
import { RedoSheetCommand, UndoSheetCommand } from '../SheetHistoryCommands';
import { SheetHistoryStatusObservation } from '../SheetHistoryObservation';
import { type SheetHistoryStatus, SheetHistoryStatusProvider } from '../SheetHistoryStatusProvider';

export interface SheetHistoryEntry {
  undo: Transaction[];
  redo: Transaction[];
  undoOrder?: number;
  redoOrder?: number;
  /** Pending group token retained until a matching command commits. */
  groupId?: string;
}

/** In-memory history retained for one sheet session while a workbook is open. */
export interface SheetHistorySessionState {
  readonly undoStack: SheetHistoryEntry[];
  readonly redoStack: SheetHistoryEntry[];
}

/** Stable session-state identity owned by SheetHistoryPlugin. */
export const SheetHistorySessionStateDefinition = defineSessionState<SheetHistorySessionState>('sheet.history');

const pluginKey = new PluginKey('SheetHistory');
const MAX_HISTORY_ENTRIES = 100;
const RecordCompletedSheetHistoryCommand = defineSheetCommand<void>('sheet.history.recordCompleted');

/** Editor-local command history for plugin-owned Sheet state with registered transaction algebra. */
@Injectable()
export class SheetHistoryPlugin extends Plugin<null> implements SheetHistoryStatusProvider {
  readonly #plugins: PluginManager;
  readonly #interaction: SheetInteractionStore;
  readonly #platform: Platform;
  readonly #externalHistory: SheetExternalHistory | undefined;

  /** DI token for resolving the default Sheet history plugin. */
  public static readonly symbol = Symbol.for('SheetHistoryPlugin');
  /** Stable owner key for the private history state. */
  public static readonly pluginKey = pluginKey;

  public readonly warnOnDuplicateDepth = false;

  readonly #listeners = new Set<(status: SheetHistoryStatus) => void>();
  #disposeCommandListener: (() => void) | null = null;
  #disposeInteractionListener: (() => void) | null = null;
  #disposeExternalHistory: (() => void) | null = null;
  #localSequence = 0;
  #historyState: SheetHistorySessionState = { undoStack: [], redoStack: [] };
  readonly #commands: SheetCommandBus;
  readonly #pendingCompletedEvents: SheetCommandEvent[] = [];

  public constructor(
    @Inject(PluginManager.symbol)
    plugins: PluginManager,
    @Inject(SheetInteractionStore.symbol)
    interaction: SheetInteractionStore,
    @Inject(Platform.symbol)
    platform: Platform,
    @Inject(SheetCommandBus.symbol)
    commands: SheetCommandBus,
    @Inject(SheetExternalHistory.symbol)
    externalHistory?: SheetExternalHistory,
  ) {
    super({ key: pluginKey, state: null });
    this.#plugins = plugins;
    this.#interaction = interaction;
    this.#platform = platform;
    this.#externalHistory = externalHistory;
    this.#commands = commands;
  }

  /** Registers typed history commands on this editor's command bus. */
  public registerCommands(commands: SheetCommandBus): void {
    if (commands !== this.#commands) throw new SearError('Sheet history commands are already bound to an editor.');
    const history = this;
    commands.register(UndoSheetCommand, function createUndoSheetCommand() {
      if (history.#useExternalUndo()) return history.#createExternalCommand('undo');
      return new PipelineExecutionCommand(UndoSheetCommand.id, history.#createHistoryPipeline('undo'));
    });
    commands.register(RedoSheetCommand, function createRedoSheetCommand() {
      if (history.#useExternalRedo()) return history.#createExternalCommand('redo');
      return new PipelineExecutionCommand(RedoSheetCommand.id, history.#createHistoryPipeline('redo'));
    });
    commands.register(
      RecordCompletedSheetHistoryCommand,
      () =>
        new LocalActionCommand(RecordCompletedSheetHistoryCommand.id, () => {
          const event = this.#pendingCompletedEvents.at(-1);
          if (!event) throw new SearError('No completed Sheet command is pending for history.');
          this.#processCompletedCommandEvent(event);
        }),
    );
  }

  /** Registers the host-facing history status observation for this editor. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(SheetHistoryStatusObservation, {
      getSnapshot: this.getStatus.bind(this),
      subscribe: this.subscribe.bind(this),
    });
  }

  /** Registers sheet-local undo and redo history for editor remounts. */
  public registerSessionState(registry: SessionStateRegistry): void {
    this.registerOwnedSessionState(registry, () => {
      registry.register(SheetHistorySessionStateDefinition, {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: this.#captureSessionState.bind(this),
        restore: (state) => {
          SessionStateRegistry.prototype.assertRestorationOpen.call(registry);
          this.#restoreSessionState(state);
        },
      });
    });
  }

  /** Starts observation of committed commands and local history status. */
  public start(): void {
    if (this.#disposeCommandListener) return;
    this.#disposeCommandListener = this.#commands.subscribe(this.#handleCommandEvent.bind(this));
    this.#disposeInteractionListener = this.#interaction.subscribe(() => this.#emitStatus());
    this.#disposeExternalHistory = this.#externalHistory?.subscribe(() => this.#emitStatus()) ?? null;
  }

  /** Releases command/status subscriptions owned by this editor instance. */
  public destroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeCommandListener?.();
    this.#disposeCommandListener = null;
    this.#disposeInteractionListener?.();
    this.#disposeInteractionListener = null;
    this.#disposeExternalHistory?.();
    this.#disposeExternalHistory = null;
    this.#listeners.clear();
  }

  /** Returns current undo and redo availability. */
  public getStatus(): SheetHistoryStatus {
    const state = this.#historyState;
    const editing = this.#interaction.getState().editSession !== null;
    return {
      canUndo: !editing && (state.undoStack.length > 0 || this.#useExternalUndo()),
      canRedo: !editing && (state.redoStack.length > 0 || this.#useExternalRedo()),
    };
  }

  #useExternalUndo(): boolean {
    const external = this.#externalHistory?.getStatus() ?? { canUndo: false, canRedo: false };
    if (!external.canUndo) return false;
    const local = this.#historyState.undoStack.at(-1);
    return (
      !local || (local.undoOrder !== void 0 && external.undoOrder !== void 0 && external.undoOrder > local.undoOrder)
    );
  }

  #useExternalRedo(): boolean {
    const external = this.#externalHistory?.getStatus() ?? { canUndo: false, canRedo: false };
    if (!external.canRedo) return false;
    const local = this.#historyState.redoStack.at(-1);
    return (
      !local || (local.redoOrder !== void 0 && external.redoOrder !== void 0 && external.redoOrder > local.redoOrder)
    );
  }

  #nextOrder(): number {
    this.#localSequence = Math.max(this.#localSequence + 1, this.#externalHistory?.nextSequence() ?? 0);
    return this.#localSequence;
  }

  #createExternalCommand(direction: 'undo' | 'redo') {
    const id = direction === 'undo' ? UndoSheetCommand.id : RedoSheetCommand.id;
    return {
      id,
      execute: () => ({
        pipeline: new Pipeline(id),
        completion: Promise.resolve().then(() => this.#externalHistory?.[direction]()),
      }),
    };
  }

  #captureSessionState(): SheetHistorySessionState {
    const state = this.#historyState;
    return {
      undoStack: cloneHistoryStack(state.undoStack),
      redoStack: cloneHistoryStack(state.redoStack),
    };
  }

  #restoreSessionState(state: SheetHistorySessionState): void {
    this.#historyState = {
      undoStack: cloneHistoryStack(state.undoStack).slice(-MAX_HISTORY_ENTRIES),
      redoStack: cloneHistoryStack(state.redoStack).slice(-MAX_HISTORY_ENTRIES),
    };
    this.#localSequence = Math.max(
      0,
      ...[...this.#historyState.undoStack, ...this.#historyState.redoStack].flatMap((entry) => [
        entry.undoOrder ?? 0,
        entry.redoOrder ?? 0,
      ]),
    );
    this.#emitStatus();
  }

  /** Subscribes to future history availability changes. */
  public subscribe(listener: (status: SheetHistoryStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** History state is private runtime state and is never persisted or synchronized. */
  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  /** History observes committed commands and owns no transactional sheet projection. */
  public apply(_state: null, _transaction: Transaction): null {
    return null;
  }

  #handleCommandEvent(event: SheetCommandEvent): void {
    if (event.phase !== CommandExecutionPhase.Completed) return;
    if (event.id === RecordCompletedSheetHistoryCommand.id) return;
    if (!eventHasTransactions(event)) return;
    this.#pendingCompletedEvents.push(event);
    try {
      this.#commands.run(RecordCompletedSheetHistoryCommand, void 0);
    } finally {
      this.#pendingCompletedEvents.pop();
    }
  }

  #processCompletedCommandEvent(event: SheetCommandEvent): void {
    if (event.id === UndoSheetCommand.id) {
      this.#completeUndo(event);
      return;
    }
    if (event.id === RedoSheetCommand.id) {
      this.#completeRedo(event);
      return;
    }

    const transactions = this.#readHistoryTransactions(event);
    if (transactions.length === 0) return;
    if (
      transactions.some(
        (transaction) =>
          transaction.getMeta<TransactionOrigin>(TRANSACTION_ORIGIN_META_KEY) === TransactionOrigin.Remote,
      )
    ) {
      this.#rebaseHistory(transactions);
      return;
    }
    this.#record(transactions, event.result?.historyGroup);
  }

  #readHistoryTransactions(event: SheetCommandEvent): Transaction[] {
    return (
      event.result?.pipeline.steps
        .filter((step) => step.kind === PipelineStepKind.Transaction && step.transaction)
        .map((step) => step.transaction as Transaction)
        .filter(
          (transaction) =>
            transaction.operations.length > 0 &&
            this.#plugins.getTransactionOTContribution(transaction)?.definition.invert !== void 0,
        ) ?? []
    );
  }

  #record(transactions: Transaction[], group?: SheetCommandResult['historyGroup']): void {
    const redo = transactions.map(cloneTransaction);
    const undo: Transaction[] = [];
    for (let index = transactions.length - 1; index >= 0; index--) {
      const transaction = transactions[index];
      const contribution = this.#plugins.getTransactionOTContribution(transaction);
      if (!contribution?.definition.invert) {
        this.#platform.warn(
          `SheetHistoryPlugin skipped command history because "${transaction.pluginKey.key}" has no invertible transaction OT definition.`,
        );
        this.#clearHistory();
        return;
      }
      try {
        const inverse = this.#plugins.invertTransaction(transaction);
        if (!inverse) {
          this.#platform.warn(
            `SheetHistoryPlugin cleared history because "${transaction.pluginKey.key}" could not invert a committed transaction.`,
          );
          this.#clearHistory();
          return;
        }
        Object.entries(transaction.meta).forEach(([key, value]) => inverse.setMeta(key, value));
        undo.push(inverse);
      } catch (error) {
        this.#platform.warn(
          `SheetHistoryPlugin cleared history because "${transaction.pluginKey.key}" failed to invert a committed transaction.`,
          error,
        );
        this.#clearHistory();
        return;
      }
    }
    if (undo.length === 0) return;

    const state = this.#historyState;
    const pending = state.undoStack.at(-1);
    const undoOrder = this.#nextOrder();
    if (group?.phase === 'end' && pending && pending.groupId === group.id) {
      pending.undo.unshift(...undo);
      pending.redo.push(...redo);
      pending.undoOrder = undoOrder;
      delete pending.groupId;
    } else {
      state.undoStack.push({ undo, redo, undoOrder, ...(group?.phase === 'begin' ? { groupId: group.id } : {}) });
    }
    if (state.undoStack.length > MAX_HISTORY_ENTRIES) {
      state.undoStack.splice(0, state.undoStack.length - MAX_HISTORY_ENTRIES);
    }
    state.redoStack.length = 0;
    this.#emitStatus();
  }

  #createHistoryPipeline(direction: 'undo' | 'redo'): Pipeline {
    const state = this.#historyState;
    const entry = direction === 'undo' ? state.undoStack.at(-1) : state.redoStack.at(-1);
    const pipeline = new Pipeline(direction === 'undo' ? UndoSheetCommand.id : RedoSheetCommand.id);
    if (this.#interaction.getState().editSession !== null) return pipeline;
    const transactions = entry?.[direction] ?? [];
    transactions.forEach((transaction, index) => {
      const historyTransaction = cloneTransaction(transaction).setMeta(
        TRANSACTION_ORIGIN_META_KEY,
        TransactionOrigin.History,
      );
      pipeline.addTransaction(`${direction}:${index}`, historyTransaction);
    });
    return pipeline;
  }

  #completeUndo(event: SheetCommandEvent): void {
    if (!eventHasTransactions(event)) return;
    const state = this.#historyState;
    const entry = state.undoStack.pop();
    if (!entry) return;
    entry.redoOrder = this.#nextOrder();
    state.redoStack.push(entry);
    this.#emitStatus();
  }

  #completeRedo(event: SheetCommandEvent): void {
    if (!eventHasTransactions(event)) return;
    const state = this.#historyState;
    const entry = state.redoStack.pop();
    if (!entry) return;
    entry.undoOrder = this.#nextOrder();
    state.undoStack.push(entry);
    this.#emitStatus();
  }

  #rebaseHistory(transactions: Transaction[]): void {
    const state = this.#historyState;
    let undoStack: SheetHistoryEntry[];
    let redoStack: SheetHistoryEntry[];
    try {
      undoStack = this.#rebaseStack(state.undoStack, transactions);
      redoStack = this.#rebaseStack(state.redoStack, transactions);
    } catch (error) {
      this.#platform.warn(
        'SheetHistoryPlugin cleared history because retained transactions could not be rebased.',
        error,
      );
      this.#clearHistory();
      return;
    }
    state.undoStack.splice(0, state.undoStack.length, ...undoStack);
    state.redoStack.splice(0, state.redoStack.length, ...redoStack);
    this.#emitStatus();
  }

  #rebaseStack(entries: SheetHistoryEntry[], transactions: Transaction[]): SheetHistoryEntry[] {
    return entries
      .map((entry) => ({
        undo: this.#rebaseTransactions(entry.undo, transactions),
        redo: this.#rebaseTransactions(entry.redo, transactions),
        ...(entry.undoOrder !== void 0 ? { undoOrder: entry.undoOrder } : {}),
        ...(entry.redoOrder !== void 0 ? { redoOrder: entry.redoOrder } : {}),
        ...(entry.groupId ? { groupId: entry.groupId } : {}),
      }))
      .filter((entry) => entry.undo.length > 0 || entry.redo.length > 0);
  }

  #rebaseTransactions(retained: Transaction[], committed: Transaction[]): Transaction[] {
    return retained.flatMap((transaction) => {
      let transformed: Transaction | null = transaction;
      for (const other of committed) {
        if (!transformed) break;
        const contribution = this.#plugins.getTransactionOTContribution(transformed);
        if (!contribution) {
          throw new SearError(
            `"${transformed.pluginKey.key}" no longer has a transaction OT definition for retained history.`,
          );
        }
        transformed = this.#plugins.transformTransaction(transformed, other);
      }
      return transformed ? [transformed] : [];
    });
  }

  #emitStatus(): void {
    const status = this.getStatus();
    runOutsideCommandExecution(() => {
      this.#listeners.forEach((listener) => this.#notifyStatusListener(listener, status));
    });
  }

  #notifyStatusListener(listener: (status: SheetHistoryStatus) => void, status: SheetHistoryStatus): void {
    try {
      listener(status);
    } catch (error) {
      this.#platform.warn('SheetHistoryPlugin status listener failed.', error);
    }
  }

  #clearHistory(): void {
    const state = this.#historyState;
    const changed = state.undoStack.length > 0 || state.redoStack.length > 0;
    state.undoStack.length = 0;
    state.redoStack.length = 0;
    if (changed) this.#emitStatus();
  }
}

function cloneTransaction(source: Transaction): Transaction {
  return createSheetTransaction(source.pluginKey, OTClone(source.operations), source.meta);
}

function cloneHistoryStack(entries: readonly SheetHistoryEntry[]): SheetHistoryEntry[] {
  return entries.map((entry) => ({
    undo: entry.undo.map(cloneTransaction),
    redo: entry.redo.map(cloneTransaction),
    ...(entry.undoOrder !== void 0 ? { undoOrder: entry.undoOrder } : {}),
    ...(entry.redoOrder !== void 0 ? { redoOrder: entry.redoOrder } : {}),
    ...(entry.groupId ? { groupId: entry.groupId } : {}),
  }));
}

function eventHasTransactions(event: SheetCommandEvent): boolean {
  return (
    event.result?.pipeline.steps.some(
      (step) => step.kind === PipelineStepKind.Transaction && (step.transaction?.operations.length ?? 0) > 0,
    ) === true
  );
}
