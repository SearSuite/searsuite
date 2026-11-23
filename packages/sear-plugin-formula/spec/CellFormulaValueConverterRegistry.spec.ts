import { CellFormulaValueConverterRegistry } from '../src/CellFormulaValueConverterRegistry';
import { FormulaResultStore } from '../src/FormulaResultStore';
import { AggregationCache, FormulaEvaluator, FormulaParser, FunctionRegistry } from '@searsuite/sear-domain-formula-engine-ts';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { ParagraphNode, TextNode } from '@searsuite/sear-domain-doc';
import {
  type EvalContext,
  type FormulaValue,
  FormulaErrorCode,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { type Platform } from '@searsuite/sear-foundation-platform';

function createPlatform(): Platform {
  return { warn: jest.fn() } as unknown as Platform;
}

function createEvalContext(data: Record<string, FormulaValue>): EvalContext {
  return {
    isCellInBounds: (row: number, col: number): boolean => row >= 0 && row < 10 && col >= 0 && col < 10,
    getSheetShape: (): [number, number] => [10, 10],
    getCellValue(row: number, col: number): FormulaValue {
      return data[`${row},${col}`] ?? 0;
    },
    iterateRange(startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaValue> {
      const values: FormulaValue[] = [];
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          values.push(data[`${row},${col}`] ?? 0);
        }
      }
      return values;
    },
  };
}

describe('CellFormulaValueConverterRegistry', () => {
  it('keeps phone values as non-numeric text', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());
    const resultStore = new FormulaResultStore(registry);

    expect(
      resultStore.cellToFormulaValue(0, 0, {
        type: 'phone',
        value: '13800138000',
      }),
    ).toEqual({ kind: 'text', value: '13800138000', numericCoercion: 'deny' });
  });

  it('handles default cell types correctly', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());

    // Empty
    expect(registry.toFormulaValue({ type: CellType.Empty })).toBe(0);

    // String
    expect(registry.toFormulaValue({ type: 'string', value: 'hello' })).toEqual({
      kind: 'text',
      value: 'hello',
      numericCoercion: 'allow',
    });

    // Number
    expect(registry.toFormulaValue({ type: 'number', value: '123' })).toBe(123);
    expect(registry.toFormulaValue({ type: 'number', value: 'abc' })).toEqual({ kind: 'error', code: '#VALUE!' });

    // Boolean cells must remain logical values when referenced by formulas.
    expect(registry.toFormulaValue({ type: CellType.Boolean, value: true })).toBe(true);
    expect(registry.toFormulaValue({ type: CellType.Boolean, value: false })).toBe(false);

    // currency
    expect(registry.toFormulaValue({ type: 'currency', value: '456' })).toBe(456);
    expect(registry.toFormulaValue({ type: 'currency', value: 'abc' })).toEqual({ kind: 'error', code: '#VALUE!' });

    // percent
    expect(registry.toFormulaValue({ type: 'percent', value: '0.5' })).toBe(0.5);
    expect(registry.toFormulaValue({ type: 'percent', value: 'abc' })).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('extracts plain text from rich-text cells for formula input', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());

    expect(
      registry.toFormulaValue({
        type: CellType.RichText,
        value: [
          {
            type: ParagraphNode.nodeType,
            content: [
              { type: TextNode.nodeType, text: '12' },
              { type: TextNode.nodeType, text: '3' },
            ],
          },
          {
            type: ParagraphNode.nodeType,
            content: [{ type: TextNode.nodeType, text: 'tail' }],
          },
        ],
      }),
    ).toEqual({
      kind: 'text',
      value: '123\ntail',
      numericCoercion: 'allow',
    });
    expect(registry.toFormulaValue({ type: CellType.RichText, value: null })).toEqual({
      kind: 'text',
      value: '',
      numericCoercion: 'allow',
    });
    expect(registry.toFormulaValue({ type: CellType.RichText, value: [null, { type: 'image' }] })).toEqual({
      kind: 'text',
      value: '\n',
      numericCoercion: 'allow',
    });
  });

  it('ignores referenced rich text in SUM while preserving arithmetic and concatenation semantics', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());
    const parser = new FormulaParser();
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const numericRichText = registry.toFormulaValue({
      type: CellType.RichText,
      value: [
        {
          type: ParagraphNode.nodeType,
          content: [
            { type: TextNode.nodeType, text: '1' },
            { type: TextNode.nodeType, text: '2' },
          ],
        },
      ],
    });
    const textRichText = registry.toFormulaValue({
      type: CellType.RichText,
      value: [{ type: ParagraphNode.nodeType, content: [{ type: TextNode.nodeType, text: 'px' }] }],
    });
    const context = createEvalContext({
      '0,0': numericRichText,
      '0,1': textRichText,
    });

    expect(evaluator.evaluate(parser.parse('=SUM(A1:B1)'), context)).toBe(0);
    expect(evaluator.evaluate(parser.parse('=A1+8'), context)).toBe(20);
    expect(evaluator.evaluate(parser.parse('=A1&"-"&B1'), context)).toBe('12-px');
  });

  it('propagates valid cell-level formula errors and converts invalid error codes to VALUE', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());

    expect(
      registry.toFormulaValue({ type: CellType.String, value: createFormulaError(FormulaErrorCode.Reference) }),
    ).toEqual({
      kind: 'error',
      code: FormulaErrorCode.Reference,
    });
    expect(registry.toFormulaValue({ type: CellType.String, value: { kind: 'error', code: '#BAD!' } })).toEqual({
      kind: 'error',
      code: FormulaErrorCode.Value,
    });
  });

  it('allows external cell types to register their formula semantics', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());
    registry.register({
      cellType: 'rating',
      toFormulaValue: (cell) => Number(cell.value) * 10,
    });

    expect(registry.toFormulaValue({ type: 'rating', value: '4.5' })).toBe(45);
  });

  it('does not retain a mutable converter definition', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());
    const converter = {
      cellType: 'rating',
      factor: 3,
      toFormulaValue(cell: { value?: unknown }) { return Number(cell.value) * this.factor; },
    };
    registry.register(converter);
    converter.cellType = 'changed';
    converter.toFormulaValue = () => 2;

    expect(registry.toFormulaValue({ type: 'rating', value: 2 })).toBe(6);
  });

  it('restores overwritten converters only when disposers release in reverse order', () => {
    const registry = new CellFormulaValueConverterRegistry(createPlatform());
    const base = registry.register({
      cellType: 'rating',
      toFormulaValue: () => 1,
    });
    const middle = registry.register({
      cellType: 'rating',
      toFormulaValue: () => 2,
    });
    const top = registry.register({
      cellType: 'rating',
      toFormulaValue: () => 3,
    });

    middle(); // stale disposer must not dislodge the current converter
    expect(registry.toFormulaValue({ type: 'rating' })).toBe(3);
    top();
    expect(registry.toFormulaValue({ type: 'rating' })).toBe(2);
    middle();
    expect(registry.toFormulaValue({ type: 'rating' })).toBe(1);
    base();
    expect(registry.toFormulaValue({ type: 'rating' })).toEqual({
      kind: 'text',
      value: '',
      numericCoercion: 'allow',
    });
  });

  it('warns and falls back to coercible text for unregistered cell types', () => {
    const platform = createPlatform();
    const registry = new CellFormulaValueConverterRegistry(platform);

    expect(registry.toFormulaValue({ type: 'unknown-type', value: '12' })).toEqual({
      kind: 'text',
      value: '12',
      numericCoercion: 'allow',
    });

    // test non-string value branch (line 21)
    expect(registry.toFormulaValue({ type: 'unknown-type', value: null })).toEqual({
      kind: 'text',
      value: '',
      numericCoercion: 'allow',
    });
    expect(registry.toFormulaValue({ type: 'unknown-type', value: 123 })).toEqual({
      kind: 'text',
      value: '123',
      numericCoercion: 'allow',
    });

    expect(platform.warn).toHaveBeenCalledWith(
      '[Formula] No value converter registered for cell type "unknown-type". Falling back to coercible text.',
    );
  });
});
