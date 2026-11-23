/**
 * Stable workbook and Sheet identities, structure, and document-state contracts.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 structure-and-session Separate Workbook structure from the active Sheet session
 * @referenceBody
 * `WorkbookDocumentState` holds stable Sheet identities, order, names, visibility, and each Sheet's document state.
 * `WorkbookSessionState` holds local values needed to remount the active Sheet. Internal references use stable
 * `sheetId` values so renaming a Sheet changes its label without changing its identity.
 *
 * The Workbook assembly mounts one active Sheet editor. Before switching, it captures that Sheet's document and
 * local session, tears down the editor, and mounts the next Sheet. Switching back restores the captured session;
 * viewport state does not become durable Workbook content.
 */

/**
 * @referenceChapter 1 structural-changes Change Workbook structure through staged operations
 * @referenceBody
 * `addWorkbookSheet()`, `moveWorkbookSheet()`, and related operations describe structural changes. The Workbook
 * assembly stages add, remove, move, rename, hide, and unhide commands as Workbook transactions, with history
 * separate from edits inside a mounted Sheet.
 *
 * **Use when:** managing several Sheets or resolving references across them. Keep structural reads and identity in
 * the Workbook domain; use the active Sheet editor and its feature commands for cell content or appearance. Formula
 * references and collaboration channels use stable Sheet identities rather than mutable display names.
 */

export { WorkbookError } from './WorkbookError';
export { WorkbookErrorCode, type WorkbookErrorCode as WorkbookErrorCodeValue } from './WorkbookErrorCode';
export {
  WorkbookCoordinateAxis,
  WorkbookCoordinateIndex,
  WorkbookReferenceField,
  type WorkbookCoordinateAxis as WorkbookCoordinateAxisValue,
  type WorkbookReferenceDiagnosticField,
  type WorkbookReferenceField as WorkbookReferenceFieldValue,
} from './WorkbookReferenceFields';
export {
  type AddWorkbookSheetInput,
  type CreateWorkbookDocumentStateInput,
  type MoveWorkbookSheetInput,
  type ParsedWorkbookFormulaReference,
  type RemoveWorkbookSheetInput,
  type RenameWorkbookSheetInput,
  type SetWorkbookSheetHiddenInput,
  type UpdateWorkbookSheetStateInput,
  type WorkbookCellKey,
  type WorkbookCellReference,
  type WorkbookColumnRangeReference,
  type WorkbookFormulaReference,
  type WorkbookId,
  type WorkbookRangeReference,
  type WorkbookRowRangeReference,
  type WorkbookSheetDescriptor,
  type WorkbookSheetId,
  type WorkbookSheetStateMap,
  type WorkbookDocumentState,
} from './WorkbookTypes';
export {
  createWorkbookCellKey,
  formatParsedWorkbookFormulaReference,
  formatWorkbookCellReference,
  formatWorkbookRangeReference,
  isValidWorkbookReference,
  isWorkbookCellReference,
  isWorkbookColumnRangeReference,
  isWorkbookRangeReference,
  isWorkbookRowRangeReference,
  normalizeWorkbookColumnRangeReference,
  normalizeWorkbookRangeReference,
  normalizeWorkbookRowRangeReference,
  parseWorkbookCellKey,
  parseWorkbookFormulaReference,
  quoteWorkbookSheetName,
} from './WorkbookReferences';
export {
  addWorkbookSheet,
  createWorkbookDocumentState,
  getWorkbookSheetDescriptor,
  getWorkbookSheetState,
  moveWorkbookSheet,
  removeWorkbookSheet,
  renameWorkbookSheet,
  setWorkbookSheetHidden,
  updateWorkbookSheetState,
  validateWorkbookDocumentState,
} from './WorkbookState';
