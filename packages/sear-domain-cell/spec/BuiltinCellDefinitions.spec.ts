import { CellType, formatCellNumber } from '@searsuite/sear-domain-cell-types';
import {
  AggregationCache,
  FormulaEvaluator,
  FormulaParser,
  FunctionRegistry,
} from '@searsuite/sear-domain-formula-engine-ts';
import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { extractRichText, formatFormulaValue } from '@searsuite/sear-domain-cell-types';
import {
  EmptyCellTypeDefinition,
  StringCellTypeDefinition,
  NumberCellTypeDefinition,
  RichTextCellTypeDefinition,
  FormulaCellTypeDefinition,
  createBuiltinCellDefinitions,
  registerBuiltinCellDefinitions,
} from '../src/BuiltinCellDefinitions';
import { CellTypeCatalog } from '../src/CellTypeCatalog';
import { CellTypeDefinition } from '../src/CellTypeDefinition';

import { type CellDisplayContext } from '../src/CellDisplayTextRegistry';

describe('BuiltinCellDefinitions', () => {
  describe('EmptyCellTypeDefinition', () => {
    it('creates expected definitions', () => {
      const def = new EmptyCellTypeDefinition();
      expect(def.type).toBe(CellType.Empty);
      expect(def.createCommitStrategies().length).toBe(1);
    });
  });

  describe('StringCellTypeDefinition', () => {
    it('creates expected definitions', () => {
      const def = new StringCellTypeDefinition();
      expect(def.type).toBe(CellType.String);
      expect(def.createCommitStrategies().length).toBe(2);
    });

    it('validates stored value', () => {
      const def = new StringCellTypeDefinition();
      expect(def.isStoredValue({ value: 'test' })).toBe(true);
      expect(def.isStoredValue({ value: 123 })).toBe(false);
    });
    it('formats display text', () => {
      const def = new StringCellTypeDefinition();
      const provider = def.createDisplayTextProvider();
      const context = {} as unknown as CellDisplayContext;
      expect(provider.getDisplayText({ type: CellType.String, value: 'test' }, context)).toBe('test');
      expect(provider.getDisplayText({ type: CellType.String, value: 123 }, context)).toBe('123');
      expect(provider.getDisplayText({ type: CellType.String }, context)).toBe('');
    });
  });

  describe('NumberCellTypeDefinition', () => {
    it('creates expected definitions', () => {
      const def = new NumberCellTypeDefinition();
      expect(def.type).toBe(CellType.Number);
      expect(def.createCommitStrategies().length).toBe(1);
    });

    it('validates stored value', () => {
      const def = new NumberCellTypeDefinition();
      expect(def.isStoredValue({ value: 123 })).toBe(true);
      expect(def.isStoredValue({ value: Infinity })).toBe(false);
      expect(def.isStoredValue({ value: '123' })).toBe(false);
    });

    it('formats display text', () => {
      const def = new NumberCellTypeDefinition();
      const provider = def.createDisplayTextProvider();
      const context = {} as unknown as CellDisplayContext;
      expect(provider.getDisplayText({ type: CellType.Number, value: 123 }, context)).toBe(
        formatCellNumber(123, undefined),
      );
      expect(provider.getDisplayText({ type: CellType.Number, value: 'not-number' }, context)).toBe('');
    });
  });

  describe('RichTextCellTypeDefinition', () => {
    it('creates expected definitions', () => {
      const def = new RichTextCellTypeDefinition();
      expect(def.type).toBe(CellType.RichText);
      expect(def.createCommitStrategies().length).toBe(1);
    });

    it('validates stored value', () => {
      const def = new RichTextCellTypeDefinition();
      expect(def.isStoredValue({ value: [{ type: 'text' }] })).toBe(true);
      expect(def.isStoredValue({ value: 'not-array' })).toBe(false);
      expect(def.isStoredValue({ value: [null] })).toBe(false);
      expect(def.isStoredValue({ value: [{ notType: 'text' }] })).toBe(false);
    });

    it('extracts display text', () => {
      const def = new RichTextCellTypeDefinition();
      const provider = def.createDisplayTextProvider();
      const value = [{ type: 'text', text: 'hello' }];
      const context = {} as unknown as CellDisplayContext;
      expect(provider.getDisplayText({ type: CellType.RichText, value }, context)).toBe(extractRichText(value));
    });
  });

  describe('FormulaCellTypeDefinition', () => {
    it('creates expected definitions', () => {
      const def = new FormulaCellTypeDefinition();
      expect(def.type).toBe(CellType.Formula);
      expect(def.createCommitStrategies().length).toBe(1);
    });

    it('validates stored value', () => {
      const def = new FormulaCellTypeDefinition();
      expect(def.isStoredValue({ formula: '=1+1' })).toBe(true);
      expect(def.isStoredValue({ formula: 123 })).toBe(false);
    });

    it('formats display text correctly', () => {
      const def = new FormulaCellTypeDefinition();
      const provider = def.createDisplayTextProvider();

      const mockProvider = {
        getFormulaResult: jest.fn(),
      };
      const contextWithNoRowCol = { formulaResultProvider: mockProvider } as unknown as CellDisplayContext;
      expect(provider.getDisplayText({ type: CellType.Formula }, contextWithNoRowCol)).toBe('');

      const contextNumber = {
        row: 1,
        col: 1,
        formulaResultProvider: mockProvider,
      } as unknown as CellDisplayContext;
      mockProvider.getFormulaResult.mockReturnValueOnce(123);
      expect(provider.getDisplayText({ type: CellType.Formula }, contextNumber)).toBe(formatCellNumber(123, undefined));

      const contextString = {
        row: 1,
        col: 1,
        formulaResultProvider: mockProvider,
      } as unknown as CellDisplayContext;
      mockProvider.getFormulaResult.mockReturnValueOnce('text');
      expect(provider.getDisplayText({ type: CellType.Formula }, contextString)).toBe(formatFormulaValue('text'));

      mockProvider.getFormulaResult.mockReturnValueOnce([
        [1, 2],
        [3, 4],
      ]);
      expect(provider.getDisplayText({ type: CellType.Formula }, contextString)).toBe('1');

      mockProvider.getFormulaResult.mockReturnValueOnce([
        [1, 2],
        [3, 4],
      ]);
      expect(provider.getDisplayText({ type: CellType.Formula }, contextNumber)).toBe('1');
    });

    it('matches TEXT formula output when formula cells use the same Excel format code', () => {
      const def = new FormulaCellTypeDefinition();
      const provider = def.createDisplayTextProvider();
      const resultProvider = {
        getFormulaResult: jest.fn(() => 1234.5),
      };
      const context = {
        row: 0,
        col: 0,
        formulaResultProvider: resultProvider,
      } as unknown as CellDisplayContext;
      const code = '#,##0.00';

      expect(provider.getDisplayText({ type: CellType.Formula, format: { kind: 'excelCode', code } }, context)).toBe(
        evaluateFormula(`=TEXT(1234.5,"${code}")`),
      );
    });
  });

  describe('Registry functions', () => {
    it('creates all builtin definitions', () => {
      const defs = createBuiltinCellDefinitions();
      expect(defs.length).toBeGreaterThan(0);
    });

    it('registers all builtin definitions', () => {
      const mockCatalog = {
        register: jest.fn().mockReturnValue(jest.fn()),
      } as unknown as CellTypeCatalog;
      const unregister = registerBuiltinCellDefinitions(mockCatalog);
      expect(mockCatalog.register).toHaveBeenCalled();
      unregister();
    });
  });
});

function evaluateFormula(formula: string): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  const context: EvalContext = {
    isCellInBounds: (row, col) => row >= 0 && row < 10 && col >= 0 && col < 10,
    getSheetShape: () => [10, 10],
    getCellValue: () => 0,
    *iterateRange() {
      yield 0;
    },
  };
  return evaluator.evaluate(new FormulaParser().parse(formula), context);
}

class MockCellTypeDefinition extends CellTypeDefinition {
  readonly type = 'mock';
}

describe('CellTypeDefinition', () => {
  it('provides default implementations', () => {
    const def = new MockCellTypeDefinition();
    expect(def.createCommitStrategies()).toEqual([]);
    expect(def.createDisplayTextProvider()).toBeUndefined();
    expect(def.isStoredValue({})).toBe(true);
  });
});
