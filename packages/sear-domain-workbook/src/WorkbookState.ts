import { WorkbookError } from './WorkbookError';
import { WorkbookErrorCode } from './WorkbookErrorCode';
import {
  type AddWorkbookSheetInput,
  type CreateWorkbookDocumentStateInput,
  type MoveWorkbookSheetInput,
  type RemoveWorkbookSheetInput,
  type RenameWorkbookSheetInput,
  type SetWorkbookSheetHiddenInput,
  type UpdateWorkbookSheetStateInput,
  type WorkbookSheetDescriptor,
  type WorkbookSheetId,
  type WorkbookDocumentState,
} from './WorkbookTypes';

/** Creates a validated workbook state using array order as the sheet tab order. */
export function createWorkbookDocumentState<SheetState = unknown>(
  input: CreateWorkbookDocumentStateInput<SheetState>,
): WorkbookDocumentState<SheetState> {
  const sheets = input.sheets.map(normalizeSheetDescriptor);
  const state: WorkbookDocumentState<SheetState> = {
    id: input.id,
    sheets,
    sheetStates: { ...input.sheetStates },
    ...(input.metadata !== void 0 ? { metadata: input.metadata } : {}),
  };
  validateWorkbookDocumentState(state);
  return state;
}

/** Validates the workbook structural invariants shared by commands and persistence. */
export function validateWorkbookDocumentState<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
): void {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  let visibleSheetCount = 0;

  for (const sheet of state.sheets) {
    const descriptor = normalizeSheetDescriptor(sheet);
    if (seenIds.has(descriptor.id)) {
      throw new WorkbookError(WorkbookErrorCode.duplicateSheetId, `Duplicate workbook sheet id "${descriptor.id}".`, {
        sheetId: descriptor.id,
      });
    }
    seenIds.add(descriptor.id);

    const normalizedName = normalizeSheetName(descriptor.name);
    const nameKey = normalizedName.toLowerCase();
    if (seenNames.has(nameKey)) {
      throw new WorkbookError(
        WorkbookErrorCode.duplicateSheetName,
        `Duplicate workbook sheet name "${normalizedName}".`,
        { sheetName: normalizedName },
      );
    }
    seenNames.add(nameKey);

    if (!(descriptor.id in state.sheetStates)) {
      throw new WorkbookError(
        WorkbookErrorCode.sheetStateMissing,
        `Workbook sheet "${descriptor.id}" is missing its sheet state payload.`,
        { sheetId: descriptor.id },
      );
    }
    if (!descriptor.hidden) visibleSheetCount += 1;
  }

  if (state.sheets.length === 0) {
    throw new WorkbookError(
      WorkbookErrorCode.workbookEmpty,
      'Workbook document must contain at least one sheet.',
      {},
    );
  }
  if (visibleSheetCount === 0) {
    throw new WorkbookError(WorkbookErrorCode.cannotHideAllSheets, 'Workbook must keep at least one visible sheet.', {
      workbookId: state.id,
    });
  }
}

/** Returns the descriptor for a sheet id, or null when the sheet is absent. */
export function getWorkbookSheetDescriptor<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  sheetId: WorkbookSheetId,
): WorkbookSheetDescriptor | null {
  return state.sheets.find((sheet) => sheet.id === sheetId) ?? null;
}

/** Returns one sheet state payload, or null when the sheet is absent. */
export function getWorkbookSheetState<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  sheetId: WorkbookSheetId,
): SheetState | null {
  return getWorkbookSheetDescriptor(state, sheetId) ? state.sheetStates[sheetId] : null;
}

/** Adds a sheet descriptor and its initial state payload without mutating the source workbook. */
export function addWorkbookSheet<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  input: AddWorkbookSheetInput<SheetState>,
): WorkbookDocumentState<SheetState> {
  validateWorkbookDocumentState(state);
  const sheet = normalizeSheetDescriptor(input.sheet);
  const index = input.index ?? state.sheets.length;
  assertInsertIndex(index, state.sheets.length);
  const sheets = [...state.sheets.slice(0, index), sheet, ...state.sheets.slice(index)];
  const nextState: WorkbookDocumentState<SheetState> = {
    ...state,
    sheets,
    sheetStates: {
      ...state.sheetStates,
      [sheet.id]: input.sheetState,
    },
  };
  validateWorkbookDocumentState(nextState);
  return nextState;
}

/** Removes a sheet descriptor and its state payload without mutating the source workbook. */
export function removeWorkbookSheet<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  input: RemoveWorkbookSheetInput,
): WorkbookDocumentState<SheetState> {
  validateWorkbookDocumentState(state);
  if (state.sheets.length <= 1) {
    throw new WorkbookError(WorkbookErrorCode.cannotRemoveLastSheet, 'Workbook must keep at least one sheet.', {
      sheetId: input.sheetId,
    });
  }
  if (!state.sheets.some((sheet) => sheet.id === input.sheetId)) throwSheetNotFound(input.sheetId);

  const sheets = state.sheets.filter((sheet) => sheet.id !== input.sheetId);
  const { [input.sheetId]: _removed, ...sheetStates } = state.sheetStates;
  const nextState: WorkbookDocumentState<SheetState> = {
    ...state,
    sheets,
    sheetStates,
  };
  validateWorkbookDocumentState(nextState);
  return nextState;
}

/** Renames a workbook sheet without mutating the source workbook. */
export function renameWorkbookSheet<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  input: RenameWorkbookSheetInput,
): WorkbookDocumentState<SheetState> {
  validateWorkbookDocumentState(state);
  requireWorkbookSheetDescriptor(state, input.sheetId);
  const name = normalizeSheetName(input.name);
  const nextState: WorkbookDocumentState<SheetState> = {
    ...state,
    sheets: state.sheets.map((sheet) => (sheet.id === input.sheetId ? { ...sheet, name } : sheet)),
  };
  validateWorkbookDocumentState(nextState);
  return nextState;
}

/** Moves a sheet descriptor to a new tab index without mutating the source workbook. */
export function moveWorkbookSheet<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  input: MoveWorkbookSheetInput,
): WorkbookDocumentState<SheetState> {
  validateWorkbookDocumentState(state);
  const fromIndex = state.sheets.findIndex((sheet) => sheet.id === input.sheetId);
  if (fromIndex === -1) throwSheetNotFound(input.sheetId);
  assertInsertIndex(input.toIndex, state.sheets.length - 1);
  const sheets = [...state.sheets];
  const [sheet] = sheets.splice(fromIndex, 1);
  sheets.splice(input.toIndex, 0, sheet);
  return { ...state, sheets };
}

/** Sets the hidden flag for a sheet without mutating the source workbook. */
export function setWorkbookSheetHidden<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  input: SetWorkbookSheetHiddenInput,
): WorkbookDocumentState<SheetState> {
  validateWorkbookDocumentState(state);
  requireWorkbookSheetDescriptor(state, input.sheetId);
  const sheets = state.sheets.map((sheet) =>
    sheet.id === input.sheetId ? setSheetDescriptorHidden(sheet, input.hidden) : sheet,
  );
  const visibleSheets = sheets.filter((sheet) => !sheet.hidden);
  if (visibleSheets.length === 0) {
    throw new WorkbookError(WorkbookErrorCode.cannotHideAllSheets, 'Workbook must keep at least one visible sheet.', {
      sheetId: input.sheetId,
    });
  }
  const nextState = { ...state, sheets };
  validateWorkbookDocumentState(nextState);
  return nextState;
}

/** Replaces one sheet state payload without mutating the source workbook. */
export function updateWorkbookSheetState<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  input: UpdateWorkbookSheetStateInput<SheetState>,
): WorkbookDocumentState<SheetState> {
  validateWorkbookDocumentState(state);
  requireWorkbookSheetDescriptor(state, input.sheetId);
  return {
    ...state,
    sheetStates: {
      ...state.sheetStates,
      [input.sheetId]: input.sheetState,
    },
  };
}

function requireWorkbookSheetDescriptor<SheetState = unknown>(
  state: WorkbookDocumentState<SheetState>,
  sheetId: WorkbookSheetId,
): WorkbookSheetDescriptor {
  const sheet = getWorkbookSheetDescriptor(state, sheetId);
  if (!sheet) throwSheetNotFound(sheetId);
  return sheet;
}

function normalizeSheetDescriptor(sheet: WorkbookSheetDescriptor): WorkbookSheetDescriptor {
  return setSheetDescriptorHidden({ ...sheet, name: normalizeSheetName(sheet.name) }, sheet.hidden === true);
}

function setSheetDescriptorHidden(sheet: WorkbookSheetDescriptor, hidden: boolean): WorkbookSheetDescriptor {
  if (hidden) return { ...sheet, hidden: true };
  const { hidden: _hidden, ...visibleSheet } = sheet;
  return visibleSheet;
}

function normalizeSheetName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new WorkbookError(WorkbookErrorCode.invalidSheetName, 'Workbook sheet name cannot be empty.', { name });
  }
  if (Array.from(normalized).length > 31 || /[:\\/?*\[\]\x00-\x1f]/.test(normalized) ||
      normalized.startsWith("'") || normalized.endsWith("'")) {
    throw new WorkbookError(WorkbookErrorCode.invalidSheetName, 'Workbook sheet name contains invalid characters or exceeds 31 characters.', { name });
  }
  return normalized;
}

function assertInsertIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new WorkbookError(WorkbookErrorCode.invalidSheetIndex, `Invalid workbook sheet index ${index}.`, {
      index,
      length,
    });
  }
}

function throwSheetNotFound(sheetId: WorkbookSheetId): never {
  throw new WorkbookError(WorkbookErrorCode.sheetNotFound, `Workbook sheet "${sheetId}" does not exist.`, {
    sheetId,
  });
}
