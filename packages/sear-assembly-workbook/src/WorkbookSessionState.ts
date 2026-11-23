import { SearError } from '@searsuite/sear-foundation-error';
import {
  SessionStateRestorePhase,
  cloneSessionStateValue,
  defineSessionState,
  type SessionStateRegistry,
  type SessionStateSnapshot,
} from '@searsuite/sear-assembly-plugin';
import { type SheetSessionState } from '@searsuite/sear-assembly-setup';
import { type WorkbookDocumentState, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';

/** Opaque editor-local workbook state keyed by contributor-owned definitions. */
export type WorkbookSessionState = SessionStateSnapshot;

/** Stable session identity for the locally active workbook sheet. */
export const WorkbookActiveSheetSessionStateDefinition = defineSessionState<WorkbookSheetId>('workbook.activeSheet');

/** Stable session identity for detached SheetEditor snapshots keyed by sheet id. */
export const WorkbookSheetSessionsStateDefinition =
  defineSessionState<Readonly<Record<WorkbookSheetId, SheetSessionState>>>('workbook.sheetSessions');

/** Owns built-in workbook session values without exposing their shape to aggregate capture. */
export class WorkbookSessionStore {
  public static readonly symbol = Symbol.for('WorkbookSessionStore');

  #activeSheetId: WorkbookSheetId;
  readonly #sheetSessions = new Map<WorkbookSheetId, SheetSessionState>();
  #captureActiveSheetSession:
    | (() => { readonly sheetId: WorkbookSheetId; readonly state?: SheetSessionState })
    | null = null;
  #commandBoundaryCheck: (() => boolean) | null = null;
  #lifecycleToken: object | null = null;

  public constructor(documentState: WorkbookDocumentState) {
    this.#activeSheetId = firstVisibleSheetId(documentState);
  }

  /** Restricts runtime session changes to this editor's command dispatch. */
  public enforceCommandBoundary(isExecuting: () => boolean, lifecycleToken: object): void {
    if (this.#commandBoundaryCheck) throw new SearError('Workbook session command boundary is already installed.');
    this.#commandBoundaryCheck = isExecuting;
    this.#lifecycleToken = lifecycleToken;
    Object.preventExtensions(this);
  }

  /** Registers the built-in contributors beside third-party workbook contributors. */
  public registerSessionState(registry: SessionStateRegistry): void {
    if (this.#commandBoundaryCheck) throw new SearError('Workbook session registration is closed for this editor.');
    registry.register(WorkbookActiveSheetSessionStateDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => this.#activeSheetId,
      restore: (sheetId) => {
        this.#assertRestorationOpen();
        this.#activeSheetId = sheetId;
      },
    });
    registry.register(WorkbookSheetSessionsStateDefinition, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => this.#captureSheetSessions(),
      restore: (states) => this.#restoreSheetSessions(states),
    });
  }

  public getActiveSheetId(): WorkbookSheetId {
    return this.#activeSheetId;
  }

  public setActiveSheetId(sheetId: WorkbookSheetId, ownerToken?: object): void {
    this.#assertWritable(ownerToken);
    this.#activeSheetId = sheetId;
  }

  public getSheetSessionState(sheetId: WorkbookSheetId): SheetSessionState | undefined {
    const state = this.#sheetSessions.get(sheetId);
    return state === undefined ? undefined : cloneSessionStateValue(state);
  }

  public setSheetSessionState(sheetId: WorkbookSheetId, state: SheetSessionState | undefined, ownerToken?: object): void {
    this.#assertWritable(ownerToken, true);
    if (state === void 0) this.#sheetSessions.delete(sheetId);
    else this.#sheetSessions.set(sheetId, cloneSessionStateValue(state));
  }

  public removeMissingSheets(liveSheetIds: ReadonlySet<WorkbookSheetId>, ownerToken?: object): void {
    this.#assertWritable(ownerToken);
    this.#sheetSessions.forEach((_state, sheetId) => {
      if (!liveSheetIds.has(sheetId)) this.#sheetSessions.delete(sheetId);
    });
  }

  public bindActiveSheetCapture(
    capture: () => { readonly sheetId: WorkbookSheetId; readonly state?: SheetSessionState },
  ): void {
    if (this.#commandBoundaryCheck) throw new SearError('Workbook session capture is already bound to its editor.');
    this.#captureActiveSheetSession = capture;
  }

  public validate(documentState: WorkbookDocumentState): void {
    const sheet = documentState.sheets.find((candidate) => candidate.id === this.#activeSheetId);
    if (!sheet || sheet.hidden) {
      throw new SearError(`Workbook session active sheet "${this.#activeSheetId}" must reference a visible sheet.`);
    }
  }

  public clear(lifecycleToken?: object): void {
    this.#assertWritable(lifecycleToken, true);
    this.#sheetSessions.clear();
    this.#captureActiveSheetSession = null;
  }

  #assertWritable(ownerToken?: object, allowLifecycle = false): void {
    if (this.#commandBoundaryCheck &&
      (ownerToken !== this.#lifecycleToken || (!allowLifecycle && !this.#commandBoundaryCheck()))) {
      throw new SearError('Workbook session changes must run through editor.commands.run(...).');
    }
  }

  #assertRestorationOpen(): void {
    if (this.#commandBoundaryCheck) {
      throw new SearError('Workbook session restoration is closed for this editor.');
    }
  }

  #captureSheetSessions(): Readonly<Record<WorkbookSheetId, SheetSessionState>> {
    const active = this.#captureActiveSheetSession?.();
    const entries = new Map(this.#sheetSessions);
    if (active?.state !== void 0) entries.set(active.sheetId, active.state);
    return Object.freeze(
      Object.fromEntries([...entries.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([sheetId, state]) => [sheetId, cloneSessionStateValue(state)])),
    );
  }

  #restoreSheetSessions(states: Readonly<Record<WorkbookSheetId, SheetSessionState>>): void {
    this.#assertRestorationOpen();
    this.#sheetSessions.clear();
    Object.entries(states).forEach(([sheetId, state]) => {
      if (state) this.#sheetSessions.set(sheetId, cloneSessionStateValue(state));
    });
  }
}

export function firstVisibleSheetId(documentState: WorkbookDocumentState): WorkbookSheetId {
  const sheetId = documentState.sheets.find((sheet) => !sheet.hidden)?.id;
  if (!sheetId) throw new SearError('Workbook document must contain a visible sheet.');
  return sheetId;
}
