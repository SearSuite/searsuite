/** Stable workbook identifier used by host-level workbook registries. */
export type WorkbookId = string;

/** Stable sheet identifier used inside workbook metadata and cross-sheet references. */
export type WorkbookSheetId = string;

/**
 * Workbook-level sheet metadata.
 *
 * The containing `WorkbookDocumentState.sheets` array is the only source of sheet order;
 * descriptors intentionally do not carry a separate order field.
 */
export interface WorkbookSheetDescriptor {
  /** Stable sheet id used by workbook state, collaboration envelopes, and formula dependencies. */
  readonly id: WorkbookSheetId;
  /** Unique user-facing sheet name used when displaying formula references. */
  readonly name: string;
  /** Optional UI tab color owned by the workbook host. */
  readonly color?: string;
  /** Whether the sheet is hidden from normal tab navigation. */
  readonly hidden?: boolean;
  /** Extension-owned serializable metadata that does not affect core workbook semantics. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Map from workbook sheet id to the host-selected sheet state payload. */
export type WorkbookSheetStateMap<SheetState = unknown> = Readonly<Record<WorkbookSheetId, SheetState>>;

/**
 * Workbook state containing sheet metadata plus per-sheet state payloads.
 *
 * `SheetState` is generic so this package stays independent from sheet, render,
 * formula, and assembly packages.
 */
export interface WorkbookDocumentState<SheetState = unknown> {
  /** Stable workbook id used by persistence and collaboration rooms. */
  readonly id: WorkbookId;
  /** Ordered sheet descriptors; array order is the persisted tab order. */
  readonly sheets: readonly WorkbookSheetDescriptor[];
  /** Per-sheet state payloads keyed by stable sheet id. */
  readonly sheetStates: WorkbookSheetStateMap<SheetState>;
  /** Extension-owned serializable metadata that does not affect core workbook semantics. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Input accepted by `createWorkbookDocumentState`. */
export interface CreateWorkbookDocumentStateInput<SheetState = unknown> {
  /** Stable workbook id used by persistence and collaboration rooms. */
  readonly id: WorkbookId;
  /** Ordered sheet descriptors. */
  readonly sheets: readonly WorkbookSheetDescriptor[];
  /** Per-sheet state payloads keyed by sheet id. */
  readonly sheetStates: WorkbookSheetStateMap<SheetState>;
  /** Extension-owned serializable metadata copied onto the workbook state. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Input accepted by `addWorkbookSheet`. */
export interface AddWorkbookSheetInput<SheetState = unknown> {
  /** Descriptor for the sheet being inserted. */
  readonly sheet: WorkbookSheetDescriptor;
  /** Initial state payload for the inserted sheet. */
  readonly sheetState: SheetState;
  /** Optional insertion index; defaults to appending after the current last sheet. */
  readonly index?: number;
}

/** Input accepted by `removeWorkbookSheet`. */
export interface RemoveWorkbookSheetInput {
  /** Sheet id to remove. */
  readonly sheetId: WorkbookSheetId;
}

/** Input accepted by `renameWorkbookSheet`. */
export interface RenameWorkbookSheetInput {
  /** Sheet id to rename. */
  readonly sheetId: WorkbookSheetId;
  /** New user-facing sheet name. */
  readonly name: string;
}

/** Input accepted by `moveWorkbookSheet`. */
export interface MoveWorkbookSheetInput {
  /** Sheet id to move. */
  readonly sheetId: WorkbookSheetId;
  /** Destination index in `WorkbookDocumentState.sheets`. */
  readonly toIndex: number;
}

/** Input accepted by `setWorkbookSheetHidden`. */
export interface SetWorkbookSheetHiddenInput {
  /** Sheet id whose hidden flag should change. */
  readonly sheetId: WorkbookSheetId;
  /** Whether the sheet should be hidden. */
  readonly hidden: boolean;
}

/** Input accepted by `updateWorkbookSheetState`. */
export interface UpdateWorkbookSheetStateInput<SheetState = unknown> {
  /** Sheet id whose state payload should be replaced. */
  readonly sheetId: WorkbookSheetId;
  /** Replacement sheet state payload. */
  readonly sheetState: SheetState;
}

/** Qualified cell reference used by workbook-level formulas and dependency graphs. */
export interface WorkbookCellReference {
  /** Stable sheet id containing the referenced cell. */
  readonly sheetId: WorkbookSheetId;
  /** Zero-based row index. */
  readonly row: number;
  /** Zero-based column index. */
  readonly col: number;
}

/** Qualified rectangular range reference used by workbook-level formulas. */
export interface WorkbookRangeReference {
  /** Stable sheet id containing the referenced range. */
  readonly sheetId: WorkbookSheetId;
  /** Zero-based top-left coordinate. */
  readonly start: readonly [number, number];
  /** Zero-based bottom-right coordinate. */
  readonly end: readonly [number, number];
}

/** Parsed workbook formula reference bound to a stable sheet id. */
export interface ParsedWorkbookFormulaReference {
  /** Stable sheet id resolved from the user-facing formula sheet name. */
  readonly sheetId: WorkbookSheetId;
  /** Normalized workbook range. Single-cell references use the same start and end coordinate. */
  readonly range: WorkbookRangeReference;
}

/** Qualified whole-column range reference used by workbook-level formulas. */
export interface WorkbookColumnRangeReference {
  /** Stable sheet id containing the referenced columns. */
  readonly sheetId: WorkbookSheetId;
  /** Zero-based start column index. */
  readonly startCol: number;
  /** Zero-based end column index. */
  readonly endCol: number;
}

/** Qualified whole-row range reference used by workbook-level formulas. */
export interface WorkbookRowRangeReference {
  /** Stable sheet id containing the referenced rows. */
  readonly sheetId: WorkbookSheetId;
  /** Zero-based start row index. */
  readonly startRow: number;
  /** Zero-based end row index. */
  readonly endRow: number;
}

/** Any workbook-qualified formula reference supported by the workbook protocol. */
export type WorkbookFormulaReference =
  | WorkbookCellReference
  | WorkbookRangeReference
  | WorkbookColumnRangeReference
  | WorkbookRowRangeReference;

/** Serialized key for a workbook-qualified formula cell. */
export type WorkbookCellKey = string;
