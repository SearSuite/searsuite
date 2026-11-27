import { SearError } from '@searsuite/sear-foundation-error';
import { runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import {
  SessionStateRestorePhase,
  defineSessionState,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { serializeSheetDocumentState, type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { type WorkbookDocumentState, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { Injectable } from '@searsuite/sear-foundation-di';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type WorkbookCommandBus } from '../../WorkbookCommandBus';
import { defineWorkbookCommand } from '../../WorkbookCommandDefinition';
import { WorkbookPlugin, type WorkbookPluginContext } from '../../WorkbookPluginContracts';
import {
  WorkbookHistoryAction,
  WorkbookTransaction,
  type WorkbookTransactionCommittedEvent,
  type WorkbookTransactionState,
} from '../../WorkbookTransaction';
import {
  WorkbookActiveSheetSessionStateDefinition,
  WorkbookSheetSessionsStateDefinition,
} from '../../WorkbookSessionState';

/** Reverts the most recent committed workbook structure mutation. */
export const UndoWorkbookCommand = defineWorkbookCommand<void>('workbook.undo');
/** Re-applies the most recently reverted workbook structure mutation. */
export const RedoWorkbookCommand = defineWorkbookCommand<void>('workbook.redo');

/** Current workbook structure undo/redo availability. */
export interface WorkbookHistoryStatus {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** Workbook transaction snapshots retained independently from SheetEditor history. */
export interface WorkbookHistoryEntry {
  readonly before: WorkbookTransactionState;
  readonly after: WorkbookTransactionState;
  undoOrder?: number;
  redoOrder?: number;
  /** Sheet content restored with this entry; other sheet content stays current. */
  readonly contentSheetIds?: readonly WorkbookSheetId[];
}

/** Workbook-local undo and redo stacks. */
export interface WorkbookHistorySessionState {
  readonly undoStack: readonly WorkbookHistoryEntry[];
  readonly redoStack: readonly WorkbookHistoryEntry[];
  readonly sequence?: number;
}

/** Session identity owned by workbook structural history. */
export const WorkbookHistorySessionStateDefinition =
  defineSessionState<WorkbookHistorySessionState>('workbook.history');

/** Typed workbook structural history status. */
export const WorkbookHistoryStatusObservation =
  defineStateObservation<WorkbookHistoryStatus>('workbook.history.status');

const MaxHistoryEntries = 100;

/** Built-in contributor for workbook structure and declared multi-sheet content history. */
@Injectable()
export class WorkbookHistoryPlugin extends WorkbookPlugin {
  public static readonly symbol = Symbol.for('WorkbookHistoryPlugin');

  readonly #undoStack: WorkbookHistoryEntry[] = [];
  readonly #redoStack: WorkbookHistoryEntry[] = [];
  #sequence = 0;
  readonly #listeners = new Set<(status: WorkbookHistoryStatus) => void>();
  #runtime: WorkbookPluginContext['runtime'] | null = null;
  #initialized = false;

  public registerCommands(commands: WorkbookCommandBus): void {
    commands.register(UndoWorkbookCommand, () => this.#executeHistory('undo'));
    commands.register(RedoWorkbookCommand, () => this.#executeHistory('redo'));
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(WorkbookHistoryStatusObservation, {
      getSnapshot: () => this.getStatus(),
      subscribe: (listener) => this.subscribe(listener),
    });
  }

  public registerSessionState(registry: SessionStateRegistry): void {
    if (this.#initialized) throw new SearError('Workbook history session restoration is closed for this editor.');
    registry.register(WorkbookHistorySessionStateDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      restoreAfter: [WorkbookActiveSheetSessionStateDefinition, WorkbookSheetSessionsStateDefinition],
      capture: () => ({
        undoStack: this.#undoStack.map(cloneHistoryEntry),
        redoStack: this.#redoStack.map(cloneHistoryEntry),
        sequence: this.#sequence,
      }),
      restore: (state) => {
        if (this.#initialized) throw new SearError('Workbook history session restoration is closed for this editor.');
        this.#undoStack.splice(
          0,
          this.#undoStack.length,
          ...state.undoStack.slice(-MaxHistoryEntries).map(cloneHistoryEntry),
        );
        this.#redoStack.splice(
          0,
          this.#redoStack.length,
          ...state.redoStack.slice(-MaxHistoryEntries).map(cloneHistoryEntry),
        );
        this.#sequence = Math.max(
          state.sequence ?? 0,
          ...[...this.#undoStack, ...this.#redoStack].flatMap((entry) => [entry.undoOrder ?? 0, entry.redoOrder ?? 0]),
        );
        this.#emitStatus();
      },
    });
  }

  public initialize(context: WorkbookPluginContext): void {
    if (this.#initialized) throw new SearError('Workbook history plugin is already initialized.');
    this.#initialized = true;
    this.#runtime = context.runtime;
  }

  public onTransactionCommitted(event: WorkbookTransactionCommittedEvent): void {
    if (!this.#requireRuntime().commands.isExecuting()) {
      throw new SearError('Workbook history changes must run through editor.commands.run(...).');
    }
    switch (event.transaction.historyAction) {
      case WorkbookHistoryAction.Record:
        if (
          sameDocumentStructure(event.before.documentState, event.after.documentState) &&
          !event.transaction.contentSheetIds.some(
            (sheetId) =>
              event.before.documentState.sheetStates[sheetId] !== event.after.documentState.sheetStates[sheetId],
          )
        )
          return;
        this.#undoStack.push({
          before: cloneTransactionState(event.before),
          after: cloneTransactionState(event.after),
          undoOrder: this.nextSequence(),
          ...(event.transaction.contentSheetIds.length
            ? { contentSheetIds: [...event.transaction.contentSheetIds] }
            : {}),
        });
        if (this.#undoStack.length > MaxHistoryEntries)
          this.#undoStack.splice(0, this.#undoStack.length - MaxHistoryEntries);
        this.#redoStack.length = 0;
        break;
      case WorkbookHistoryAction.Undo: {
        const entry = this.#undoStack.pop();
        if (entry) {
          entry.redoOrder = this.nextSequence();
          this.#redoStack.push(entry);
        }
        break;
      }
      case WorkbookHistoryAction.Redo: {
        const entry = this.#redoStack.pop();
        if (entry) {
          entry.undoOrder = this.nextSequence();
          this.#undoStack.push(entry);
        }
        break;
      }
      default:
        return;
    }
    this.#emitStatus();
  }

  public onWorkbookDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#runtime = null;
    this.#listeners.clear();
  }

  public getStatus(): WorkbookHistoryStatus {
    return { canUndo: this.#undoStack.length > 0, canRedo: this.#redoStack.length > 0 };
  }

  public getOrderStatus(): { undoOrder?: number; redoOrder?: number } {
    return {
      ...(this.#undoStack.at(-1)?.undoOrder !== void 0 ? { undoOrder: this.#undoStack.at(-1)!.undoOrder } : {}),
      ...(this.#redoStack.at(-1)?.redoOrder !== void 0 ? { redoOrder: this.#redoStack.at(-1)!.redoOrder } : {}),
    };
  }

  public nextSequence(): number {
    return ++this.#sequence;
  }

  /** Exposes only multi-sheet content entries to the mounted Sheet history adapter. */
  public getContentMoveStatus(): WorkbookHistoryStatus {
    return {
      canUndo: (this.#undoStack.at(-1)?.contentSheetIds?.length ?? 0) > 1,
      canRedo: (this.#redoStack.at(-1)?.contentSheetIds?.length ?? 0) > 1,
    };
  }

  #executeHistory(action: 'undo' | 'redo') {
    const runtime = this.#requireRuntime();
    const stack = action === 'undo' ? this.#undoStack : this.#redoStack;
    const entry = stack[stack.length - 1];
    if (!entry) return runtime.createCommandResult(false);
    const target = action === 'undo' ? entry.before : entry.after;
    const transaction = new WorkbookTransaction(
      action === 'undo' ? UndoWorkbookCommand.id : RedoWorkbookCommand.id,
      action === 'undo' ? WorkbookHistoryAction.Undo : WorkbookHistoryAction.Redo,
    );
    transaction.addStep(`${transaction.id}:restore`, (current) => {
      const expected = action === 'undo' ? entry.after.documentState : entry.before.documentState;
      for (const sheetId of entry.contentSheetIds ?? []) {
        const live = current.documentState.sheetStates[sheetId];
        const recorded = expected.sheetStates[sheetId];
        if (
          !live ||
          !recorded ||
          JSON.stringify(serializeSheetDocumentState(live)) !== JSON.stringify(serializeSheetDocumentState(recorded))
        ) {
          throw new SearError(`Sheet "${sheetId}" changed after the cross-sheet move; undo its newer edits first.`);
        }
      }
      const documentState = mergeCurrentSheetStates(
        current.documentState,
        target.documentState,
        entry.contentSheetIds ?? [],
      );
      return {
        documentState,
        activeSheetId: chooseRestoredActiveSheet(current.activeSheetId, target.activeSheetId, documentState),
      };
    });
    return runtime.executeTransaction(transaction);
  }

  public subscribe(listener: (status: WorkbookHistoryStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emitStatus(): void {
    const status = this.getStatus();
    runOutsideCommandExecution(() => this.#listeners.forEach((listener) => listener(status)));
  }

  #requireRuntime(): WorkbookPluginContext['runtime'] {
    if (this.#runtime) return this.#runtime;
    throw new SearError('WorkbookHistoryPlugin has not been initialized.');
  }
}

function mergeCurrentSheetStates(
  current: WorkbookDocumentState<SheetDocumentState>,
  target: WorkbookDocumentState<SheetDocumentState>,
  contentSheetIds: readonly WorkbookSheetId[],
): WorkbookDocumentState<SheetDocumentState> {
  const contentSheets = new Set(contentSheetIds);
  return {
    ...target,
    sheets: target.sheets.map((sheet) => ({ ...sheet })),
    sheetStates: Object.fromEntries(
      target.sheets.map((sheet) => [
        sheet.id,
        contentSheets.has(sheet.id)
          ? target.sheetStates[sheet.id]
          : current.sheetStates[sheet.id] ?? target.sheetStates[sheet.id],
      ]),
    ),
  };
}

function chooseRestoredActiveSheet(
  current: WorkbookSheetId,
  fallback: WorkbookSheetId,
  documentState: WorkbookDocumentState<SheetDocumentState>,
): WorkbookSheetId {
  const currentSheet = documentState.sheets.find((sheet) => sheet.id === current);
  if (currentSheet && !currentSheet.hidden) return current;
  const fallbackSheet = documentState.sheets.find((sheet) => sheet.id === fallback);
  return fallbackSheet && !fallbackSheet.hidden
    ? fallback
    : (documentState.sheets.find((sheet) => !sheet.hidden)?.id as WorkbookSheetId);
}

function cloneHistoryEntry(entry: WorkbookHistoryEntry): WorkbookHistoryEntry {
  return {
    before: cloneTransactionState(entry.before),
    after: cloneTransactionState(entry.after),
    ...(entry.undoOrder !== void 0 ? { undoOrder: entry.undoOrder } : {}),
    ...(entry.redoOrder !== void 0 ? { redoOrder: entry.redoOrder } : {}),
    ...(entry.contentSheetIds ? { contentSheetIds: [...entry.contentSheetIds] } : {}),
  };
}

function cloneTransactionState(state: WorkbookTransactionState): WorkbookTransactionState {
  return {
    activeSheetId: state.activeSheetId,
    documentState: {
      ...state.documentState,
      sheets: state.documentState.sheets.map((sheet) => ({ ...sheet })),
      sheetStates: { ...state.documentState.sheetStates },
    },
  };
}

function sameDocumentStructure(
  left: WorkbookDocumentState<SheetDocumentState>,
  right: WorkbookDocumentState<SheetDocumentState>,
): boolean {
  return (
    JSON.stringify(left.sheets) === JSON.stringify(right.sheets) &&
    JSON.stringify(left.metadata) === JSON.stringify(right.metadata)
  );
}
