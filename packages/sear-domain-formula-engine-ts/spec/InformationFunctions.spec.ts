import {
  FormulaErrorCode,
  FormulaServiceCacheStatus,
  FormulaStockHistoryServiceDefinition,
  type FormulaExternalServiceDefinition,
  type FormulaMetadataReader,
  type FormulaStockHistoryService,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaExternalServiceRegistry } from '../src/FormulaExternalServiceRegistry';
import { evaluateCategoryFormula } from './FormulaCategoryTestUtils';

const metadata: FormulaMetadataReader = {
  readCell: ({ row, col, sheetName }) => {
    if (row === 0 && col === 0)
      return { reference: { row, col, ...(sheetName ? { sheetName } : {}) }, source: 'empty', value: 0 };
    if (row === 1 && col === 1)
      return {
        reference: { row, col },
        source: 'formula',
        value: 42,
        formula: '=40+2',
        numberFormat: '0.00',
        width: 12,
      };
    return { reference: { row, col }, source: 'value', value: 'text' };
  },
  readWorkbook: () => ({
    currentSheetId: 's1',
    currentSheetName: 'Data',
    sheets: [
      { id: 's1', name: 'Data', index: 1 },
      { id: 's2', name: 'Other', index: 2 },
    ],
  }),
  readEnvironment: () => ({ operatingSystem: 'Test OS', version: '1.0', system: 'test', calculationMode: 'Automatic' }),
};

describe('information formulas', () => {
  it('BUG-336 inspects each element of range arguments', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    expect(evaluateCategoryFormula('=ISNUMBER(D185:D186)', { '184,3': 'redo-probe', '185,3': 10 }))
      .toEqual([[false], [true]]);
    expect(evaluateCategoryFormula('=ISERROR(D190:D191)', { '189,3': 1, '190,3': error }))
      .toEqual([[false], [true]]);
    expect(evaluateCategoryFormula('=ISNUMBER(D185:D186)', { '185,3': 10 }, {
      iterateRangeCells: () => [
        { row: 184, col: 3, value: 0, source: 'empty' },
        { row: 185, col: 3, value: 10, source: 'value' },
      ],
    })).toEqual([[false], [true]]);
  });

  it('distinguishes scalar types and errors', () => {
    expect(evaluateCategoryFormula('=ISNUMBER(42)')).toBe(true);
    expect(evaluateCategoryFormula('=ISNUMBER(A1)', { '0,0': 0 }, {
      iterateRangeCells: () => [{ row: 0, col: 0, value: 0, source: 'empty' }],
    })).toBe(false);
    expect(evaluateCategoryFormula('=ISTEXT("x")')).toBe(true);
    expect(evaluateCategoryFormula('=ISNONTEXT(TRUE)')).toBe(true);
    expect(evaluateCategoryFormula('=ISLOGICAL(FALSE)')).toBe(true);
    expect(evaluateCategoryFormula('=ISEVEN(-4.9)')).toBe(true);
    expect(evaluateCategoryFormula('=ISODD(-3.9)')).toBe(true);
    expect(evaluateCategoryFormula('=ISEVEN("2024-02-29")')).toBe(false);
    expect(evaluateCategoryFormula('=ISODD("2024-02-29")')).toBe(true);
    expect(evaluateCategoryFormula('=ISEVEN("2")')).toBe(true);
    expect(evaluateCategoryFormula('=ISODD("3")')).toBe(true);
    expect(evaluateCategoryFormula('=ISEVEN("0")')).toBe(true);
    expect(evaluateCategoryFormula('=ISEVEN(TRUE)')).toBe(false);
    expect(evaluateCategoryFormula('=ISEVEN(FALSE)')).toBe(true);
    expect(evaluateCategoryFormula('=ISODD(TRUE)')).toBe(true);
    expect(evaluateCategoryFormula('=ISODD(FALSE)')).toBe(false);
    expect(evaluateCategoryFormula('=ISERROR(1/0)')).toBe(true);
    expect(evaluateCategoryFormula('=ISERR(NA())')).toBe(false);
    expect(evaluateCategoryFormula('=ISNA(NA())')).toBe(true);
    expect(evaluateCategoryFormula('=ERROR.TYPE(1/0)')).toBe(2);
    expect(evaluateCategoryFormula('=ERROR.TYPE(A1)', {
      '0,0': { kind: 'error', code: FormulaErrorCode.Spill },
    })).toBe(9);
    expect(evaluateCategoryFormula('=TYPE({1,2})')).toBe(64);
    expect(evaluateCategoryFormula('=N(TRUE)')).toBe(1);
  });

  it('BUG-1017 coerces recognized date text for odd and even checks', () => {
    const data = { '0,0': '2024-02-29' };
    expect(evaluateCategoryFormula('=ISEVEN(A1)', data)).toBe(false);
    expect(evaluateCategoryFormula('=ISODD(IF(TRUE,A1,0))', data)).toBe(true);
    expect(evaluateCategoryFormula('=ISEVEN("2024-03-01")')).toBe(true);
    expect(evaluateCategoryFormula('=ISODD("2024-03-01")')).toBe(false);
    expect(evaluateCategoryFormula('=ISEVEN("not a date")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('BUG-1036 coerces boolean references and recalculates after numeric edits', () => {
    const data: Record<string, boolean | number> = { '0,0': true };
    expect(evaluateCategoryFormula('=ISEVEN(A1)', data)).toBe(false);
    expect(evaluateCategoryFormula('=ISODD(IF(TRUE,A1,0))', data)).toBe(true);
    data['0,0'] = false;
    expect(evaluateCategoryFormula('=ISEVEN(A1)', data)).toBe(true);
    expect(evaluateCategoryFormula('=ISODD(IF(TRUE,A1,0))', data)).toBe(false);
    data['0,0'] = 2;
    expect(evaluateCategoryFormula('=ISEVEN(A1)', data)).toBe(true);
    expect(evaluateCategoryFormula('=ISODD(IF(TRUE,A1,0))', data)).toBe(false);
  });

  it('uses metadata to distinguish blank, formula, cell location, and workbook structure', () => {
    const context = { metadata, currentCell: { row: 1, col: 1 } };
    expect(evaluateCategoryFormula('=ISBLANK(A1)', {}, context)).toBe(true);
    expect(evaluateCategoryFormula('=ISBLANK("")', {}, context)).toBe(false);
    expect(evaluateCategoryFormula('=ISFORMULA(B2)', {}, context)).toBe(true);
    expect(evaluateCategoryFormula('=ISREF(B2)', {}, context)).toBe(true);
    expect(evaluateCategoryFormula('=ISREF(IF(TRUE,B2,0))', {}, context)).toBe(true);
    expect(evaluateCategoryFormula('=ISREF(IF(FALSE,B2,0))', {}, context)).toBe(false);
    expect(evaluateCategoryFormula('=CELL("row",B2)', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=CELL("row",IF(TRUE,A1,0))', {
      '0,0': { kind: 'error', code: FormulaErrorCode.DivisionByZero },
    }, context)).toBe(1);
    expect(evaluateCategoryFormula('=CELL("address",B2)', {}, context)).toBe('$B$2');
    expect(evaluateCategoryFormula('=CELL("format",B2)', {}, context)).toBe('F2');
    expect(evaluateCategoryFormula('=SHEET()', {}, context)).toBe(1);
    expect(evaluateCategoryFormula('=SHEET(Other!A1)', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=SHEET("Other")', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=SHEET("other")', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=SHEET("missing")', {}, context)).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluateCategoryFormula('=SHEET()', {}, {
      metadata: { ...metadata, readWorkbook: () => ({
        currentSheetId: 's2', currentSheetName: 'Other',
        sheets: [{ id: 's1', name: 'Data', index: 1 }, { id: 's2', name: 'Other', index: 2 }],
      }) },
    })).toBe(2);
    expect(evaluateCategoryFormula('=SHEETS()', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=INFO("numfile")', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=INFO("origin")', {}, {
      metadata: { ...metadata, readVisibleOrigin: () => ({ row: 22, col: 2 }) },
    })).toBe('$C$23');
    expect(evaluateCategoryFormula('=INFO("origin")')).toBe('$A$1');
    expect(evaluateCategoryFormula('=SHEET(Hi_Temps)', {}, context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.Name,
    });
    expect(evaluateCategoryFormula('=SHEET(1)', {}, context)).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluateCategoryFormula('=SHEETS()', {}, context)).toBe(2);
    expect(evaluateCategoryFormula('=SHEETS(IF(TRUE,B2,0))', {}, context)).toBe(1);
    expect(evaluateCategoryFormula('=INFO("osversion")', {}, context)).toBe('Test OS');
  });

  it('counts a local reference when workbook metadata is unavailable', () => {
    expect(evaluateCategoryFormula('=SHEET()')).toBe(1);
    expect(evaluateCategoryFormula('=SHEET(A1)')).toBe(1);
    expect(evaluateCategoryFormula('=SHEET(TRUE)')).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
    expect(evaluateCategoryFormula('=SHEETS(A1)')).toBe(1);
    expect(evaluateCategoryFormula('=SHEETS(IF(TRUE,A1,0))')).toBe(1);
    expect(evaluateCategoryFormula('=SHEETS()')).toBe(1);
    expect(evaluateCategoryFormula('=SHEETS(TRUE)')).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
  });

  it('reads STOCKHISTORY only from the synchronous host cache', () => {
    const services = new FormulaExternalServiceRegistry();
    const service: FormulaStockHistoryService = {
      read: () => ({
        status: FormulaServiceCacheStatus.Ready,
        value: [
          ['Date', 'Close'],
          [45_000, 100],
        ],
      }),
      subscribeInvalidation: () => () => void 0,
    };
    services.register(FormulaStockHistoryServiceDefinition, service);
    expect(evaluateCategoryFormula('=STOCKHISTORY("MSFT",45000)', {}, { externalServices: services })).toEqual([
      ['Date', 'Close'],
      [45_000, 100],
    ]);
    const unavailable = { get: <T>(_definition: FormulaExternalServiceDefinition<T>): T | undefined => undefined };
    expect(evaluateCategoryFormula('=STOCKHISTORY("MSFT",45000)', {}, { externalServices: unavailable })).toEqual({
      kind: 'error',
      code: FormulaErrorCode.NotAvailable,
    });
  });

  it('validates unsupported information requests', () => {
    expect(evaluateCategoryFormula('=ERROR.TYPE(1)')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluateCategoryFormula('=CELL("unknown",A1)', {}, { metadata })).toEqual({
      kind: 'error',
      code: FormulaErrorCode.Value,
    });
    expect(evaluateCategoryFormula('=NA(1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });
});
