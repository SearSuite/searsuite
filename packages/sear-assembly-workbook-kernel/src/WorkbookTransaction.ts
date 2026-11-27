import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { type WorkbookDocumentState, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';

/** Controls whether a committed workbook transaction participates in structural history. */
export const WorkbookHistoryAction = {
  Ignore: 'ignore',
  Record: 'record',
  Undo: 'undo',
  Redo: 'redo',
} as const;

/** History behavior attached to one workbook transaction. */
export type WorkbookHistoryAction = (typeof WorkbookHistoryAction)[keyof typeof WorkbookHistoryAction];

/** Detached state staged by workbook transaction reducers. */
export interface WorkbookTransactionState {
  readonly documentState: WorkbookDocumentState<SheetDocumentState>;
  readonly activeSheetId: WorkbookSheetId;
}

/** One pure staged workbook mutation. */
export type WorkbookTransactionReducer = (state: WorkbookTransactionState) => WorkbookTransactionState;

interface WorkbookTransactionStep {
  readonly name: string;
  readonly reduce: WorkbookTransactionReducer;
}

/**
 * Ordered, atomic workbook mutation assembled inside a typed command handler.
 * Reducers stage state only; the WorkbookEditor owns validation and commit.
 */
export class WorkbookTransaction {
  readonly #steps: WorkbookTransactionStep[] = [];

  public constructor(
    public readonly id: string,
    public readonly historyAction: WorkbookHistoryAction = WorkbookHistoryAction.Ignore,
    /** Sheet states whose before/after snapshots belong to this history entry. */
    contentSheetIds: readonly WorkbookSheetId[] = [],
  ) {
    this.contentSheetIds = Object.freeze([...new Set(contentSheetIds)]);
  }

  public readonly contentSheetIds: readonly WorkbookSheetId[];

  /** Adds one pure reducer to the staged transaction. */
  public addStep(name: string, reduce: WorkbookTransactionReducer): this {
    if (!name.trim()) throw new SearError('Workbook transaction steps require a non-empty name.');
    this.#steps.push({ name, reduce });
    return this;
  }

  /** @internal Applies every reducer without mutating the source snapshot. */
  public stage(initial: WorkbookTransactionState): WorkbookTransactionState {
    return this.#steps.reduce((state, step) => step.reduce(state), initial);
  }

  /** Returns stable step names for diagnostics and tests. */
  public getStepNames(): readonly string[] {
    return this.#steps.map((step) => step.name);
  }
}

/** Immutable event delivered after a complete workbook transaction commits. */
export interface WorkbookTransactionCommittedEvent {
  readonly transaction: WorkbookTransaction;
  readonly before: WorkbookTransactionState;
  readonly after: WorkbookTransactionState;
}
