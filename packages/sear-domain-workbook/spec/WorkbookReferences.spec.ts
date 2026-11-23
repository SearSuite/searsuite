import {
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
  WorkbookError,
  WorkbookErrorCode,
  type WorkbookErrorCodeValue,
} from '../src';

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

describe('WorkbookReferences', () => {
  const sheets = [
    { id: 'sheet-1', name: 'Sheet1' },
    { id: 'sheet-2', name: 'Sheet2' },
    { id: 'sheet-3', name: 'Sales Data' },
    { id: 'sheet-4', name: "Bob's Plan" },
  ];

  it('round-trips stable workbook cell keys', () => {
    const reference = { sheetId: 'sheet:1', row: 12, col: 27 };
    const key = createWorkbookCellKey(reference);

    expect(key).toBe('["sheet:1",12,27]');
    expect(parseWorkbookCellKey(key)).toEqual(reference);
  });

  it('normalizes reversed workbook range references', () => {
    expect(normalizeWorkbookRangeReference({ sheetId: 'sheet-1', start: [5, 3], end: [1, 8] })).toEqual({
      sheetId: 'sheet-1',
      start: [1, 3],
      end: [5, 8],
    });
    expect(normalizeWorkbookColumnRangeReference({ sheetId: 'sheet-1', startCol: 4, endCol: 2 })).toEqual({
      sheetId: 'sheet-1',
      startCol: 2,
      endCol: 4,
    });
    expect(normalizeWorkbookRowRangeReference({ sheetId: 'sheet-1', startRow: 7, endRow: 3 })).toEqual({
      sheetId: 'sheet-1',
      startRow: 3,
      endRow: 7,
    });
  });

  it('quotes workbook sheet names for formula display and formats A1 references', () => {
    expect(quoteWorkbookSheetName('Sheet2')).toBe('Sheet2');
    expect(quoteWorkbookSheetName('Sales Data')).toBe("'Sales Data'");
    expect(quoteWorkbookSheetName("Bob's Plan")).toBe("'Bob''s Plan'");
    expect(formatWorkbookCellReference({ sheetId: 's1', row: 0, col: 0 }, 'Sheet2')).toBe('Sheet2!A1');
    expect(formatWorkbookCellReference({ sheetId: 's1', row: 9, col: 27 }, 'Sales Data')).toBe("'Sales Data'!AB10");
    expect(formatWorkbookRangeReference({ sheetId: 's1', start: [0, 0], end: [4, 1] }, 'Sales Data')).toBe(
      "'Sales Data'!A1:B5",
    );
  });

  it('parses displayed cross-sheet references into stable sheet-id ranges', () => {
    expect(parseWorkbookFormulaReference('Sheet2!A1', sheets)).toEqual({
      sheetId: 'sheet-2',
      range: { sheetId: 'sheet-2', start: [0, 0], end: [0, 0] },
    });
    expect(parseWorkbookFormulaReference("'Sales Data'!AB10", sheets)).toEqual({
      sheetId: 'sheet-3',
      range: { sheetId: 'sheet-3', start: [9, 27], end: [9, 27] },
    });
    expect(parseWorkbookFormulaReference("'Bob''s Plan'!$B$2", sheets)).toEqual({
      sheetId: 'sheet-4',
      range: { sheetId: 'sheet-4', start: [1, 1], end: [1, 1] },
    });
    expect(parseWorkbookFormulaReference("'Sales Data'!B5:A1", sheets)).toEqual({
      sheetId: 'sheet-3',
      range: { sheetId: 'sheet-3', start: [0, 0], end: [4, 1] },
    });
  });

  it('formats parsed workbook formula references with the current sheet name', () => {
    const parsed = parseWorkbookFormulaReference('Sheet2!A1', sheets);
    const parsedRange = parseWorkbookFormulaReference('Sheet2!A1:B5', sheets);
    const renamedSheets = sheets.map((sheet) => (sheet.id === 'sheet-2' ? { ...sheet, name: 'Revenue Data' } : sheet));

    expect(formatParsedWorkbookFormulaReference(parsed, sheets)).toBe('Sheet2!A1');
    expect(formatParsedWorkbookFormulaReference(parsed, renamedSheets)).toBe("'Revenue Data'!A1");
    expect(formatParsedWorkbookFormulaReference(parsedRange, renamedSheets)).toBe("'Revenue Data'!A1:B5");
  });

  it('identifies valid workbook formula reference shapes', () => {
    expect(isWorkbookCellReference({ sheetId: 'sheet-1', row: 0, col: 1 })).toBe(true);
    expect(isWorkbookRangeReference({ sheetId: 'sheet-1', start: [0, 1], end: [2, 3] })).toBe(true);
    expect(isWorkbookColumnRangeReference({ sheetId: 'sheet-1', startCol: 0, endCol: 2 })).toBe(true);
    expect(isWorkbookRowRangeReference({ sheetId: 'sheet-1', startRow: 0, endRow: 2 })).toBe(true);

    expect(isValidWorkbookReference({ sheetId: 'sheet-1', row: 0, col: 1 })).toBe(true);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', start: [0, 1], end: [2, 3] })).toBe(true);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', startCol: 0, endCol: 2 })).toBe(true);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', startRow: 0, endRow: 2 })).toBe(true);
  });

  it('rejects deleted or malformed workbook formula reference shapes', () => {
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', row: -1, col: 1 })).toBe(false);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', start: [0, 1], end: [-1, 3] })).toBe(false);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', startCol: 0, endCol: -1 })).toBe(false);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', startRow: -1, endRow: 2 })).toBe(false);
    expect(isValidWorkbookReference({ sheetId: '', row: 0, col: 1 })).toBe(false);
    expect(isValidWorkbookReference({ sheetId: 'sheet-1', row: 0 })).toBe(false);
  });

  it('rejects malformed cell keys and references', () => {
    expectWorkbookErrorCode(() => parseWorkbookCellKey('not-json'), WorkbookErrorCode.invalidCellKey);
    expectWorkbookErrorCode(() => parseWorkbookCellKey('["sheet",1]'), WorkbookErrorCode.invalidCellKey);
    expectWorkbookErrorCode(
      () => createWorkbookCellKey({ sheetId: '', row: 0, col: 0 }),
      WorkbookErrorCode.invalidReference,
    );
    expectWorkbookErrorCode(
      () => createWorkbookCellKey({ sheetId: 'sheet', row: -1, col: 0 }),
      WorkbookErrorCode.invalidReference,
    );
    expectWorkbookErrorCode(
      () => normalizeWorkbookRangeReference({ sheetId: 'sheet', start: [0] as never, end: [0, 0] }),
      WorkbookErrorCode.invalidReference,
    );
    expectWorkbookErrorCode(
      () => normalizeWorkbookColumnRangeReference({ sheetId: 'sheet', startCol: 0.5, endCol: 2 }),
      WorkbookErrorCode.invalidReference,
    );
    expectWorkbookErrorCode(
      () => normalizeWorkbookRowRangeReference({ sheetId: 'sheet', startRow: 0, endRow: -2 }),
      WorkbookErrorCode.invalidReference,
    );
    expectWorkbookErrorCode(() => parseWorkbookFormulaReference('Sheet2A1', sheets), WorkbookErrorCode.invalidReference);
    expectWorkbookErrorCode(() => parseWorkbookFormulaReference("'Sales Data!A1", sheets), WorkbookErrorCode.invalidReference);
    expectWorkbookErrorCode(() => parseWorkbookFormulaReference('Missing!A1', sheets), WorkbookErrorCode.sheetNotFound);
    expectWorkbookErrorCode(
      () =>
        formatParsedWorkbookFormulaReference(
          { sheetId: 'missing', range: { sheetId: 'missing', start: [0, 0], end: [0, 0] } },
          sheets,
        ),
      WorkbookErrorCode.sheetNotFound,
    );
  });
});
