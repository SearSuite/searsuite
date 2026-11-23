import {
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
  WorkbookError,
  WorkbookErrorCode,
  type WorkbookDocumentState,
  type WorkbookErrorCodeValue,
} from '../src';

interface TestSheetState {
  readonly cells: string;
}

function createState(): WorkbookDocumentState<TestSheetState> {
  return createWorkbookDocumentState({
    id: 'book-1',
    sheets: [
      { id: 'sheet-1', name: ' Sheet1 ' },
      { id: 'sheet-2', name: 'Data' },
    ],
    sheetStates: {
      'sheet-1': { cells: 'a' },
      'sheet-2': { cells: 'b' },
    },
    metadata: { owner: 'test' },
  });
}

function expectWorkbookErrorCode(action: () => void, code: WorkbookErrorCodeValue): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(WorkbookError);
    expect((error as WorkbookError).code).toBe(code);
    return;
  }
  throw new Error(`Expected workbook error code ${code}.`);
}

describe('WorkbookDocumentState', () => {
  it('creates normalized document state without local active-sheet state', () => {
    const state = createState();

    expect(state.sheets.map((sheet) => sheet.name)).toEqual(['Sheet1', 'Data']);
    expect(getWorkbookSheetDescriptor(state, 'sheet-1')?.id).toBe('sheet-1');
    expect(getWorkbookSheetState(state, 'sheet-2')).toEqual({ cells: 'b' });
    expect(getWorkbookSheetState(state, 'missing')).toBeNull();
    expect(state).not.toHaveProperty('activeSheetId');
    expect(state.metadata).toEqual({ owner: 'test' });
  });

  it('applies document-only sheet structure operations immutably', () => {
    const state = createState();
    const added = addWorkbookSheet(state, {
      sheet: { id: 'sheet-3', name: 'Summary' },
      sheetState: { cells: 'c' },
      index: 1,
    });
    const moved = moveWorkbookSheet(added, { sheetId: 'sheet-3', toIndex: 2 });
    const renamed = renameWorkbookSheet(moved, { sheetId: 'sheet-3', name: ' Final ' });
    const updated = updateWorkbookSheetState(renamed, {
      sheetId: 'sheet-3',
      sheetState: { cells: 'z' },
    });
    const hidden = setWorkbookSheetHidden(updated, { sheetId: 'sheet-2', hidden: true });
    const shown = setWorkbookSheetHidden(hidden, { sheetId: 'sheet-2', hidden: false });
    const removed = removeWorkbookSheet(shown, { sheetId: 'sheet-1' });

    expect(state.sheets.map((sheet) => sheet.id)).toEqual(['sheet-1', 'sheet-2']);
    expect(removed.sheets.map((sheet) => `${sheet.id}:${sheet.name}`)).toEqual([
      'sheet-2:Data',
      'sheet-3:Final',
    ]);
    expect(getWorkbookSheetState(removed, 'sheet-3')).toEqual({ cells: 'z' });
    expect(getWorkbookSheetState(removed, 'sheet-1')).toBeNull();
  });

  it('reports document validation errors with stable codes', () => {
    expectWorkbookErrorCode(
      () => createWorkbookDocumentState({ id: 'book', sheets: [], sheetStates: {} }),
      WorkbookErrorCode.workbookEmpty,
    );
    expectWorkbookErrorCode(
      () =>
        createWorkbookDocumentState({
          id: 'book',
          sheets: [
            { id: 'a', name: 'One' },
            { id: 'a', name: 'Two' },
          ],
          sheetStates: { a: {} },
        }),
      WorkbookErrorCode.duplicateSheetId,
    );
    expectWorkbookErrorCode(
      () =>
        createWorkbookDocumentState({
          id: 'book',
          sheets: [
            { id: 'a', name: 'One' },
            { id: 'b', name: ' one ' },
          ],
          sheetStates: { a: {}, b: {} },
        }),
      WorkbookErrorCode.duplicateSheetName,
    );
    expectWorkbookErrorCode(
      () =>
        validateWorkbookDocumentState({
          id: 'book',
          sheets: [{ id: 'a', name: 'One' }],
          sheetStates: {},
        }),
      WorkbookErrorCode.sheetStateMissing,
    );
    expectWorkbookErrorCode(
      () =>
        createWorkbookDocumentState({
          id: 'book',
          sheets: [{ id: 'a', name: 'One', hidden: true }],
          sheetStates: { a: {} },
        }),
      WorkbookErrorCode.cannotHideAllSheets,
    );
  });

  it('INT15-020 rejects invalid sheet names through create, add, and rename', () => {
    const state = createState();
    for (const name of ['Bad/Name', 'Bad*Name', 'Bad:Name', 'Bad\\Name', 'Bad?Name', 'Bad[Name]', "'Edge", "Edge'", 'A'.repeat(32)]) {
      expectWorkbookErrorCode(
        () => createWorkbookDocumentState({ id: 'book', sheets: [{ id: 'a', name }], sheetStates: { a: {} } }),
        WorkbookErrorCode.invalidSheetName,
      );
      expectWorkbookErrorCode(
        () => addWorkbookSheet(state, { sheet: { id: 'sheet-3', name }, sheetState: { cells: 'c' } }),
        WorkbookErrorCode.invalidSheetName,
      );
      expectWorkbookErrorCode(
        () => renameWorkbookSheet(state, { sheetId: 'sheet-1', name }),
        WorkbookErrorCode.invalidSheetName,
      );
    }
    expect(renameWorkbookSheet(state, { sheetId: 'sheet-1', name: 'Sales data' }).sheets[0]?.name).toBe('Sales data');
    expect(renameWorkbookSheet(state, { sheetId: 'sheet-1', name: 'A'.repeat(31) }).sheets[0]?.name).toHaveLength(31);
  });

  it('reports operation errors with stable codes', () => {
    const state = createState();

    expectWorkbookErrorCode(
      () =>
        addWorkbookSheet(state, {
          sheet: { id: 'sheet-3', name: 'Three' },
          sheetState: { cells: 'c' },
          index: 99,
        }),
      WorkbookErrorCode.invalidSheetIndex,
    );
    expectWorkbookErrorCode(
      () => renameWorkbookSheet(state, { sheetId: 'missing', name: 'New' }),
      WorkbookErrorCode.sheetNotFound,
    );
    expectWorkbookErrorCode(
      () => moveWorkbookSheet(state, { sheetId: 'sheet-1', toIndex: 99 }),
      WorkbookErrorCode.invalidSheetIndex,
    );
    expectWorkbookErrorCode(
      () => updateWorkbookSheetState(state, { sheetId: 'missing', sheetState: { cells: 'x' } }),
      WorkbookErrorCode.sheetNotFound,
    );
    expectWorkbookErrorCode(
      () => removeWorkbookSheet(removeWorkbookSheet(state, { sheetId: 'sheet-2' }), { sheetId: 'sheet-1' }),
      WorkbookErrorCode.cannotRemoveLastSheet,
    );
    expectWorkbookErrorCode(
      () =>
        setWorkbookSheetHidden(setWorkbookSheetHidden(state, { sheetId: 'sheet-1', hidden: true }), {
          sheetId: 'sheet-2',
          hidden: true,
        }),
      WorkbookErrorCode.cannotHideAllSheets,
    );
  });
});
