/** Stable machine-readable error codes owned by the workbook domain package. */
export const WorkbookErrorCode = {
  /** A sheet id appears more than once in one workbook. */
  duplicateSheetId: 'SEAR_WORKBOOK_DUPLICATE_SHEET_ID',
  /** A sheet name appears more than once in one workbook. */
  duplicateSheetName: 'SEAR_WORKBOOK_DUPLICATE_SHEET_NAME',
  /** A requested sheet id is not present in the workbook. */
  sheetNotFound: 'SEAR_WORKBOOK_SHEET_NOT_FOUND',
  /** A workbook document contains no sheets. */
  workbookEmpty: 'SEAR_WORKBOOK_EMPTY',
  /** A workbook sheet name is empty or otherwise invalid. */
  invalidSheetName: 'SEAR_WORKBOOK_INVALID_SHEET_NAME',
  /** A workbook sheet state entry is missing for a declared sheet. */
  sheetStateMissing: 'SEAR_WORKBOOK_SHEET_STATE_MISSING',
  /** A sheet insertion index is outside the legal sheet-list boundary. */
  invalidSheetIndex: 'SEAR_WORKBOOK_INVALID_SHEET_INDEX',
  /** A workbook operation attempted to remove the final sheet. */
  cannotRemoveLastSheet: 'SEAR_WORKBOOK_CANNOT_REMOVE_LAST_SHEET',
  /** A workbook operation attempted to hide every sheet. */
  cannotHideAllSheets: 'SEAR_WORKBOOK_CANNOT_HIDE_ALL_SHEETS',
  /** A cross-sheet formula reference has invalid coordinates. */
  invalidReference: 'SEAR_WORKBOOK_INVALID_REFERENCE',
  /** A serialized workbook cell key cannot be parsed. */
  invalidCellKey: 'SEAR_WORKBOOK_INVALID_CELL_KEY',
} as const;

/** Machine-readable workbook error code type. */
export type WorkbookErrorCode = (typeof WorkbookErrorCode)[keyof typeof WorkbookErrorCode];
