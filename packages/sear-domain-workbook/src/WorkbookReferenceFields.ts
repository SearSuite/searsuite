/** Stable property names used by workbook-qualified formula references. */
export const WorkbookReferenceField = {
  sheetId: 'sheetId',
  row: 'row',
  col: 'col',
  start: 'start',
  end: 'end',
  startCol: 'startCol',
  endCol: 'endCol',
  startRow: 'startRow',
  endRow: 'endRow',
} as const;

/** Stable workbook reference property-name type. */
export type WorkbookReferenceField = (typeof WorkbookReferenceField)[keyof typeof WorkbookReferenceField];

/** Stable coordinate axis names used by tuple-backed workbook range references. */
export const WorkbookCoordinateAxis = {
  row: WorkbookReferenceField.row,
  col: WorkbookReferenceField.col,
} as const;

/** Stable workbook coordinate axis-name type. */
export type WorkbookCoordinateAxis = (typeof WorkbookCoordinateAxis)[keyof typeof WorkbookCoordinateAxis];

/** Tuple positions for workbook range coordinates. */
export const WorkbookCoordinateIndex = {
  [WorkbookCoordinateAxis.row]: 0,
  [WorkbookCoordinateAxis.col]: 1,
} as const;

/** Diagnostic field path emitted by workbook reference validation errors. */
export type WorkbookReferenceDiagnosticField =
  | WorkbookReferenceField
  | `${typeof WorkbookReferenceField.start}.${WorkbookCoordinateAxis}`
  | `${typeof WorkbookReferenceField.end}.${WorkbookCoordinateAxis}`;
