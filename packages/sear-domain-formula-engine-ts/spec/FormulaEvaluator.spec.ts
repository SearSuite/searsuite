import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { cellKey } from '../src/cellKey';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions/index';
import { AggregationCache } from '../src/AggregationCache';
import {
  type FormulaValue,
  type EvalContext,
  type FormulaError,
  FormulaErrorCode,
} from '@searsuite/sear-domain-formula-engine';

/**
 * Creates a mock evaluation context.
 *
 * @param data Cell data map (row,col -> value).
 */
function createMockContext(data: Record<string, FormulaValue>, shape: [number, number] = [1000, 1000]): EvalContext {
  return {
    isCellInBounds(row: number, col: number): boolean {
      return row >= 0 && row < shape[0] && col >= 0 && col < shape[1];
    },
    getCellValue(row: number, col: number): FormulaValue {
      const key = `${row},${col}`;
      return data[key] ?? 0;
    },
    iterateRange(startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaValue> {
      const values: FormulaValue[] = [];
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = `${r},${c}`;
          values.push(data[key] ?? 0);
        }
      }
      return values;
    },
  };
}

describe('FormulaEvaluator', () => {
  let evaluator: FormulaEvaluator;
  let parser: FormulaParser;
  let registry: FunctionRegistry;

  beforeEach(() => {
    registry = new FunctionRegistry();
    const aggCache = new AggregationCache();
    evaluator = new FormulaEvaluator(registry, aggCache);
    parser = new FormulaParser();
  });

  function evaluate(
    formula: string,
    data: Record<string, FormulaValue> = {},
    shape: [number, number] = [1000, 1000],
  ): FormulaValue {
    const ast = parser.parse(formula);
    const context = createMockContext(data, shape);
    return evaluator.evaluate(ast, context);
  }

  it('captures a direct HYPERLINK target without changing its scalar result', () => {
    const context = createMockContext({ '0,0': 'https://example.com/updated' });
    const direct = evaluator.evaluateBatch([
      { key: cellKey(1, 0), ast: parser.parse('=HYPERLINK(A1,"Open")') },
    ], context)[0];
    expect(direct).toEqual({
      key: cellKey(1, 0), value: 'Open',
      richResult: { kind: 'hyperlink', target: 'https://example.com/updated', label: 'Open' },
    });
    expect(evaluator.evaluateBatch([
      { key: cellKey(1, 1), ast: parser.parse('=IF(TRUE,HYPERLINK(A1,"Open"),"")') },
    ], context)[0]).toEqual({ key: cellKey(1, 1), value: 'Open' });
  });

  it('intersects direct OFFSET references at the formula cell while preserving nested ranges', () => {
    const context = createMockContext({ '0,0': 2.625, '999,1': 23 }, [50000, 1000]);
    const at = (formula: string) => evaluator.evaluateBatch([
      { key: cellKey(999, 701), ast: parser.parse(formula) },
    ], context)[0]?.value;
    expect(at('=OFFSET(A1,1,1,$A1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(at('=OFFSET(A1,1,1,4.8754)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(at('=OFFSET(A1,1,1,45000)')).toBe(23);
    expect(at('=ROWS(OFFSET(A1,1,1,4.8754))')).toBe(4);
  });

  describe('literals', () => {
    it('evaluates number', () => {
      expect(evaluate('=42')).toBe(42);
    });

    it('evaluates decimal', () => {
      expect(evaluate('=3.14')).toBe(3.14);
    });

    it('evaluates string', () => {
      expect(evaluate('="hello"')).toBe('hello');
    });

    it('evaluates boolean TRUE', () => {
      expect(evaluate('=TRUE')).toBe(true);
    });

    it('evaluates boolean FALSE', () => {
      expect(evaluate('=FALSE')).toBe(false);
    });

    it('propagates a persisted invalid reference', () => {
      expect(evaluate('=#REF!')).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
      expect(evaluate('=SUM(#REF!,A1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
    });
  });

  describe('arithmetic', () => {
    it('coerces date text in scalar and array arithmetic', () => {
      expect(evaluate('="2024-02-29"*2')).toBe(90702);
      expect(evaluate('=A1*2', { '0,0': '2024-02-29' })).toBe(90702);
      expect(evaluate('={"2024-02-29",1}*2')).toEqual([[90702, 2]]);
      expect(evaluate('=-"2024-02-29"')).toBe(-45351);
      expect(evaluate('=A1*2', {
        '0,0': { kind: 'text', value: '2024-02-29', numericCoercion: 'deny' },
      })).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    });

    it('coerces referenced percent text without allowing arbitrary stored text', () => {
      expect(evaluate('=A1/12', {
        '0,0': { kind: 'text', value: '8%', numericCoercion: 'deny' },
      })).toBeCloseTo(0.08 / 12);
      expect(evaluate('=A1/12', {
        '0,0': { kind: 'text', value: '8%', numericCoercion: 'allow' },
      })).toBeCloseTo(0.08 / 12);
      expect(evaluate('=A1/12', {
        '0,0': { kind: 'text', value: 'eight percent', numericCoercion: 'deny' },
      })).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    });

    it('addition', () => {
      expect(evaluate('=1+2')).toBe(3);
    });

    it('subtraction', () => {
      expect(evaluate('=10-3')).toBe(7);
    });

    it('multiplication', () => {
      expect(evaluate('=4*5')).toBe(20);
    });

    it('division', () => {
      expect(evaluate('=10/2')).toBe(5);
    });

    it('returns #NUM! for overflowing scalar and array arithmetic', () => {
      for (const formula of ['=1E308*2', '=1E308+1E308', '=1E308/1E-308', '=-1E308-1E308']) {
        expect(evaluate(formula)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      }
      expect(evaluate('={1E308,1}*2')).toEqual([
        [{ kind: 'error', code: FormulaErrorCode.Number }, 2],
      ]);
    });

    it('power', () => {
      expect(evaluate('=2^3')).toBe(8);
      expect(evaluate('=0^-1')).toEqual({ kind: 'error', code: '#DIV/0!' });
      expect(evaluate('=(-1)^0.5')).toEqual({ kind: 'error', code: '#NUM!' });
    });

    it('precedence: 1+2*3 = 7', () => {
      expect(evaluate('=1+2*3')).toBe(7);
    });

    it('precedence: (1+2)*3 = 9', () => {
      expect(evaluate('=(1+2)*3')).toBe(9);
    });

    it('evaluates addition before comparison and concatenation', () => {
      expect(evaluate('=1+2=3')).toBe(true);
      expect(evaluate('=(1+2)=3')).toBe(true);
      expect(evaluate('=1+2&3')).toBe('33');
      expect(evaluate('="a"&1+2')).toBe('a3');
    });

    it('applies each consecutive postfix percentage', () => {
      expect(evaluate('=100%%')).toBe(0.01);
      expect(evaluate('=100%%%')).toBe(0.0001);
    });

    it('keeps text literals unchanged during formula syntax normalization', () => {
      expect(evaluate('=EXACT("，",",")')).toBe(false);
      expect(evaluate('=EXACT("。",".")')).toBe(false);
      expect(evaluate('=EXACT("：",":")')).toBe(false);
      expect(evaluate('=EXACT("协方差.S","COVARIANCE.S")')).toBe(false);
      expect(evaluate('=LEN("“好”")')).toBe(3);
    });

    it('division by zero → #DIV/0!', () => {
      const result = evaluate('=1/0') as FormulaError;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#DIV/0!');
    });
  });

  describe('cell references', () => {
    it('BUG-662 evaluates either order of two range corners', () => {
      const data = { '24,4': 11, '25,5': 22 };
      expect(evaluate('=SUM(E25:F26)', data)).toBe(33);
      expect(evaluate('=SUM(F26:E25)', data)).toBe(33);
      expect(evaluate('=SUM(F25:E26)', data)).toBe(33);
    });

    it('reads cell value', () => {
      expect(evaluate('=A1', { '0,0': 42 })).toBe(42);
    });

    it('adds two cells', () => {
      expect(evaluate('=A1+B1', { '0,0': 10, '0,1': 20 })).toBe(30);
    });

    it('empty cell treated as 0', () => {
      expect(evaluate('=A1+1', {})).toBe(1);
    });

    it('returns #REF! when row is outside the sheet', () => {
      expect(evaluate('=A2', {}, [1, 1])).toEqual({
        kind: 'error',
        code: '#REF!',
      });
    });

    it('returns #REF! when column is outside the sheet', () => {
      expect(evaluate('=B1', {}, [1, 1])).toEqual({
        kind: 'error',
        code: '#REF!',
      });
    });

    it('does not coerce a non-numeric cell type into arithmetic', () => {
      expect(
        evaluate('=A1+1', {
          '0,0': {
            kind: 'text',
            value: '13800138000',
            numericCoercion: 'deny',
          },
        }),
      ).toEqual({ kind: 'error', code: '#VALUE!' });
    });
  });

  describe('error propagation', () => {
    it('error + number → error', () => {
      const error: FormulaError = { kind: 'error', code: '#DIV/0!' };
      const result = evaluate('=A1+1', { '0,0': error }) as FormulaError;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#DIV/0!');
    });

    it('number * error → error', () => {
      const error: FormulaError = { kind: 'error', code: '#VALUE!' };
      const result = evaluate('=1*A1', { '0,0': error }) as FormulaError;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });
  });

  describe('implicit type conversion', () => {
    it('string number + number', () => {
      expect(evaluate('=A1+1', { '0,0': '5' })).toBe(6);
    });

    it('boolean + number (TRUE → 1)', () => {
      expect(evaluate('=A1+1', { '0,0': true })).toBe(2);
    });

    it('invalid string + number → #VALUE!', () => {
      const result = evaluate('=A1+1', { '0,0': 'hello' }) as FormulaError;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });

    it('invalid right operand in + returns #VALUE!', () => {
      const result = evaluate('=1+A1', { '0,0': 'oops' }) as FormulaError;
      expect(result).toEqual({ kind: 'error', code: '#VALUE!' });
    });

    it('invalid left operand in -, *, /, ^ returns #VALUE!', () => {
      expect(evaluate('=A1-1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate('=A1*1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate('=A1/1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate('=A1^1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
    });

    it('invalid right operand in -, *, /, ^ returns #VALUE!', () => {
      expect(evaluate('=1-A1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate('=1*A1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate('=1/A1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate('=1^A1', { '0,0': 'bad' })).toEqual({ kind: 'error', code: '#VALUE!' });
    });
  });

  describe('string concatenation', () => {
    it('concatenates strings', () => {
      expect(evaluate('="hello"&" "&"world"')).toBe('hello world');
    });

    it('concatenates number as string', () => {
      expect(evaluate('="value: "&42')).toBe('value: 42');
    });

    it('concatenates boolean as string', () => {
      expect(evaluate('="result: "&TRUE')).toBe('result: TRUE');
    });
  });

  describe('comparison', () => {
    it('uses numeric intermediate results for consecutive comparisons', () => {
      expect(evaluate('=1<2<3')).toBe(true);
      expect(evaluate('=1<2<0')).toBe(false);
      expect(evaluate('=TRUE<3')).toBe(false);
    });

    it('equal', () => {
      expect(evaluate('=1=1')).toBe(true);
      expect(evaluate('=1=2')).toBe(false);
    });

    it('not equal', () => {
      expect(evaluate('=1<>2')).toBe(true);
      expect(evaluate('=1<>1')).toBe(false);
    });

    it('less than', () => {
      expect(evaluate('=1<2')).toBe(true);
      expect(evaluate('=2<1')).toBe(false);
    });

    it('greater than', () => {
      expect(evaluate('=2>1')).toBe(true);
      expect(evaluate('=1>2')).toBe(false);
    });

    it('less than or equal', () => {
      expect(evaluate('=1<=1')).toBe(true);
      expect(evaluate('=1<=2')).toBe(true);
      expect(evaluate('=2<=1')).toBe(false);
    });

    it('greater than or equal', () => {
      expect(evaluate('=1>=1')).toBe(true);
      expect(evaluate('=2>=1')).toBe(true);
      expect(evaluate('=1>=2')).toBe(false);
    });
  });

  describe('unary operators', () => {
    it('negation', () => {
      expect(evaluate('=-5')).toBe(-5);
    });

    it('percentage', () => {
      expect(evaluate('=50%')).toBe(0.5);
    });

    it('double negation', () => {
      expect(evaluate('=--5')).toBe(5);
    });
  });

  describe('function calls', () => {
    it('SUM with range', () => {
      const data = { '0,0': 10, '1,0': 20, '2,0': 30 };
      expect(evaluate('=SUM(A1:A3)', data)).toBe(60);
    });

    it('SUM with multiple args', () => {
      expect(evaluate('=SUM(1,2,3)')).toBe(6);
    });

    it('SUM with cell refs', () => {
      const data = { '0,0': 10, '0,1': 20 };
      expect(evaluate('=SUM(A1,B1)', data)).toBe(30);
    });

    it('COUNT with range', () => {
      const data = { '0,0': 10, '1,0': 'text', '2,0': 20 };
      expect(evaluate('=COUNT(A1:A3)', data)).toBe(2);
    });

    it('unknown function → #NAME?', () => {
      const result = evaluate('=FOO(1)') as FormulaError;
      expect(result.kind).toBe('error');
      expect(result.code).toBe(FormulaErrorCode.Name);
    });

    it('SUM error propagation', () => {
      const error: FormulaError = { kind: 'error', code: '#DIV/0!' };
      const data = { '0,0': 10, '1,0': error, '2,0': 30 };
      const result = evaluate('=SUM(A1:A3)', data) as FormulaError;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#DIV/0!');
    });

    it('SUM returns #REF! for an out-of-bounds cell', () => {
      expect(evaluate('=SUM(B1)', {}, [1, 1])).toEqual({
        kind: 'error',
        code: '#REF!',
      });
    });

    it('SUM returns #REF! for an out-of-bounds range', () => {
      expect(evaluate('=SUM(A1:A2)', {}, [1, 1])).toEqual({
        kind: 'error',
        code: '#REF!',
      });
    });

    it('SUM returns #VALUE! for non-numeric typed text', () => {
      expect(
        evaluate('=SUM(A1)', {
          '0,0': {
            kind: 'text',
            value: '13800138000',
            numericCoercion: 'deny',
          },
        }),
      ).toEqual({ kind: 'error', code: '#VALUE!' });
    });
  });

  describe('evaluateBatch', () => {
    it('evaluates multiple ASTs', () => {
      const ast1 = parser.parse('=1+2');
      const ast2 = parser.parse('=3*4');
      const context = createMockContext({});

      const results = evaluator.evaluateBatch(
        [
          { key: 1, ast: ast1 },
          { key: 2, ast: ast2 },
        ],
        context,
      );

      expect(results.length).toBe(2);
      expect(results[0]).toEqual({ key: 1, value: 3 });
      expect(results[1]).toEqual({ key: 2, value: 12 });
    });
  });

  describe('direct Range/ColumnRange/RowRange evaluate (line 66-70)', () => {
    it('evaluating a bare range reference returns #VALUE!', () => {
      // A raw range AST node at top-level (not inside a function) → #VALUE!
      const rangeAST = {
        kind: 'range' as const,
        start: [0, 0] as [number, number],
        end: [2, 0] as [number, number],
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(rangeAST, context) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });

    it('evaluating a bare column-range reference returns #VALUE!', () => {
      const colRangeAST = {
        kind: 'columnRange' as const,
        startCol: 0,
        endCol: 1,
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(colRangeAST, context) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });

    it('evaluating a bare row-range reference returns #VALUE!', () => {
      const rowRangeAST = {
        kind: 'rowRange' as const,
        startRow: 0,
        endRow: 1,
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(rowRangeAST, context) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });
  });

  describe('registerFunction (line 103)', () => {
    it('registers and calls a custom function', () => {
      const customFn = {
        name: 'DOUBLE',
        evaluate: (args: any[]) => {
          const val = args[0]?.value ?? 0;
          return (val as number) * 2;
        },
      };
      evaluator.registerFunction(customFn as any);
      expect(evaluate('=DOUBLE(5)')).toBe(10);
    });
  });

  describe('getCellValue throwing (line 119)', () => {
    it('returns #REF! when getCellValue throws', () => {
      const throwingContext = {
        isCellInBounds: () => true,
        getCellValue: () => {
          throw new Error('Cell error');
        },
        iterateRange: () => [],
      };
      const ast = parser.parse('=A1');
      const result = evaluator.evaluate(ast, throwingContext as any) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#REF!');
    });
  });

  describe('binary default case (line 198)', () => {
    it('unknown binary operator returns #VALUE!', () => {
      // Inject an AST with unknown op directly
      const unknownBinaryAST = {
        kind: 'binary' as const,
        op: '??',
        left: { kind: 'number' as const, value: 1 },
        right: { kind: 'number' as const, value: 2 },
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(unknownBinaryAST, context) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });
  });

  describe('unary operators (lines 217-232)', () => {
    it('unary + returns the number unchanged', () => {
      // The parser may not support unary + directly; inject AST
      const unaryPlusAST = {
        kind: 'unary' as const,
        op: '+',
        operand: { kind: 'number' as const, value: 42 },
      } as any;
      const context = createMockContext({});
      expect(evaluator.evaluate(unaryPlusAST, context)).toBe(42);
    });

    it('NOT true returns false', () => {
      const notAST = {
        kind: 'unary' as const,
        op: 'NOT',
        operand: { kind: 'boolean' as const, value: true },
      } as any;
      const context = createMockContext({});
      expect(evaluator.evaluate(notAST, context)).toBe(false);
    });

    it('NOT false returns true', () => {
      const notAST = {
        kind: 'unary' as const,
        op: 'NOT',
        operand: { kind: 'boolean' as const, value: false },
      } as any;
      const context = createMockContext({});
      expect(evaluator.evaluate(notAST, context)).toBe(true);
    });

    it('NOT non-boolean returns #VALUE!', () => {
      const notAST = {
        kind: 'unary' as const,
        op: 'NOT',
        operand: { kind: 'number' as const, value: 1 },
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(notAST, context) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });

    it('unknown unary operator returns #VALUE!', () => {
      const unknownUnaryAST = {
        kind: 'unary' as const,
        op: '??',
        operand: { kind: 'number' as const, value: 1 },
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(unknownUnaryAST, context) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#VALUE!');
    });

    it('unary error propagation returns the operand error directly', () => {
      const errOperand = {
        kind: 'unary' as const,
        op: '-',
        operand: { kind: 'cell' as const, row: 0, col: 0 },
      } as any;
      const context = createMockContext({ '0,0': { kind: 'error', code: '#REF!' } as FormulaError });
      const result = evaluator.evaluate(errOperand, context);
      expect(result).toEqual({ kind: 'error', code: '#REF!' });
    });

    it('unary -, +, % return #VALUE! when numeric coercion fails', () => {
      const context = createMockContext({});
      const unaryMinus = {
        kind: 'unary' as const,
        op: '-',
        operand: { kind: 'string' as const, value: 'NaN-text' },
      } as any;
      const unaryPlus = {
        kind: 'unary' as const,
        op: '+',
        operand: { kind: 'string' as const, value: 'NaN-text' },
      } as any;
      const unaryPercent = {
        kind: 'unary' as const,
        op: '%',
        operand: { kind: 'string' as const, value: 'NaN-text' },
      } as any;

      expect(evaluator.evaluate(unaryMinus, context)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluator.evaluate(unaryPlus, context)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluator.evaluate(unaryPercent, context)).toEqual({ kind: 'error', code: '#VALUE!' });
    });
  });

  describe('compareValues string and boolean comparisons (lines 359-383)', () => {
    it('compares strings: "a" < "b"', () => {
      expect(evaluate('="a"<"b"')).toBe(true);
    });

    it('compares strings: "b" > "a"', () => {
      expect(evaluate('="b">"a"')).toBe(true);
    });

    it('compares equal strings', () => {
      expect(evaluate('="abc"="abc"')).toBe(true);
    });

    it('ignores case for ordinary text comparisons but not EXACT', () => {
      expect(evaluate('="a"="A"')).toBe(true);
      expect(evaluate('="a">"A"')).toBe(false);
      expect(evaluate('=EXACT("a","A")')).toBe(false);
    });

    it('compares booleans: TRUE > FALSE', () => {
      expect(evaluate('=TRUE>FALSE')).toBe(true);
    });

    it('compares equal booleans', () => {
      expect(evaluate('=TRUE=TRUE')).toBe(true);
    });

    it('number < string (type order)', () => {
      expect(evaluate('=1<"a"')).toBe(true);
    });

    it('string < boolean (type order)', () => {
      expect(evaluate('="a"<TRUE')).toBe(true);
    });

    it('concatenate FormulaText value (line 342)', () => {
      // getCellValue returning a FormulaText object
      const formulaTextContext = {
        isCellInBounds: () => true,
        getCellValue: () => ({ kind: 'text', value: 'hello', numericCoercion: 'deny' }),
        iterateRange: () => [],
      };
      const ast = parser.parse('=A1&" world"');
      const result = evaluator.evaluate(ast, formulaTextContext as any);
      expect(result).toBe('hello world');
    });

    it('concatenates FALSE as string', () => {
      expect(evaluate('="state: "&FALSE')).toBe('state: FALSE');
    });

    it('compare string and FormulaText paths', () => {
      const registryWithText = new FunctionRegistry();
      const evaluatorWithText = new FormulaEvaluator(registryWithText, new AggregationCache());
      registryWithText.register({
        name: 'TXT',
        evaluate: () => ({ kind: 'text', value: 'abc', numericCoercion: 'deny' }),
      } as any);

      const textCompareAST = {
        kind: 'binary' as const,
        op: '=',
        left: { kind: 'call' as const, name: 'TXT', args: [] },
        right: { kind: 'string' as const, value: 'abc' },
      } as any;
      expect(evaluatorWithText.evaluate(textCompareAST, createMockContext({}))).toBe(true);
    });

    it('compare booleans when left is FALSE', () => {
      expect(evaluate('=FALSE=FALSE')).toBe(true);
    });

    it('compares plain string against FormulaText on the right side', () => {
      const contextWithFormulaText = createMockContext({
        '0,0': {
          kind: 'text',
          value: 'abc',
          numericCoercion: 'deny',
        } as any,
      });

      expect(evaluator.evaluate(parser.parse('="abc"=A1'), contextWithFormulaText)).toBe(true);
    });
  });

  describe('ColumnRange / RowRange in function calls (lines 273-306)', () => {
    it('ColumnRange returns #REF! when getSheetShape returns 0 rows', () => {
      const zeroRowContext = {
        isCellInBounds: (r: number, c: number) => r >= 0 && r < 0 && c >= 0 && c < 100,
        getCellValue: () => 0,
        iterateRange: () => [],
        getSheetShape: () => [0, 100] as [number, number],
      };
      // Use SUM with a column range A:A
      const colRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [
          {
            kind: 'columnRange' as const,
            startCol: 0,
            endCol: 0,
          },
        ],
      } as any;
      const result = evaluator.evaluate(colRangeArgAST, zeroRowContext as any) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#REF!');
    });

    it('ColumnRange returns #REF! when column is out of bounds', () => {
      const smallContext = {
        isCellInBounds: (r: number, c: number) => r >= 0 && r < 10 && c >= 0 && c < 2,
        getCellValue: () => 0,
        iterateRange: () => [],
        getSheetShape: () => [10, 2] as [number, number],
      };
      const colRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [
          {
            kind: 'columnRange' as const,
            startCol: 0,
            endCol: 5, // out of bounds
          },
        ],
      } as any;
      const result = evaluator.evaluate(colRangeArgAST, smallContext as any) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#REF!');
    });

    it('RowRange returns #REF! when getSheetShape returns 0 cols', () => {
      const zeroColContext = {
        isCellInBounds: (r: number, c: number) => r >= 0 && r < 100 && c >= 0 && c < 0,
        getCellValue: () => 0,
        iterateRange: () => [],
        getSheetShape: () => [100, 0] as [number, number],
      };
      const rowRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [
          {
            kind: 'rowRange' as const,
            startRow: 0,
            endRow: 0,
          },
        ],
      } as any;
      const result = evaluator.evaluate(rowRangeArgAST, zeroColContext as any) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#REF!');
    });

    it('RowRange returns #REF! when row is out of bounds', () => {
      const smallContext = {
        isCellInBounds: (r: number, c: number) => r >= 0 && r < 2 && c >= 0 && c < 10,
        getCellValue: () => 0,
        iterateRange: () => [],
        getSheetShape: () => [2, 10] as [number, number],
      };
      const rowRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [
          {
            kind: 'rowRange' as const,
            startRow: 0,
            endRow: 5, // out of bounds
          },
        ],
      } as any;
      const result = evaluator.evaluate(rowRangeArgAST, smallContext as any) as any;
      expect(result.kind).toBe('error');
      expect(result.code).toBe('#REF!');
    });

    it('ColumnRange valid path: SUM(A:A) with in-bounds context', () => {
      const validContext = {
        isCellInBounds: (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 10,
        getCellValue: () => 0,
        iterateRange: (_sr: number, _sc: number, _er: number, _ec: number) => [10, 20, 30],
        getSheetShape: () => [3, 10] as [number, number],
        aggregationCache: undefined,
      };
      const colRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [
          {
            kind: 'columnRange' as const,
            startCol: 0,
            endCol: 0,
          },
        ],
      } as any;
      const result = evaluator.evaluate(colRangeArgAST, validContext as any);
      expect(typeof result).toBe('number');
      expect(result).toBe(60); // 10+20+30
    });

    it('RowRange valid path: SUM(1:1) with in-bounds context', () => {
      const validContext = {
        isCellInBounds: (r: number, c: number) => r >= 0 && r < 10 && c >= 0 && c < 3,
        getCellValue: () => 0,
        iterateRange: (_sr: number, _sc: number, _er: number, _ec: number) => [5, 10, 15],
        getSheetShape: () => [10, 3] as [number, number],
        aggregationCache: undefined,
      };
      const rowRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [
          {
            kind: 'rowRange' as const,
            startRow: 0,
            endRow: 0,
          },
        ],
      } as any;
      const result = evaluator.evaluate(rowRangeArgAST, validContext as any);
      expect(typeof result).toBe('number');
      expect(result).toBe(30); // 5+10+15
    });

    it('ColumnRange falls back to default sheet shape when getSheetShape is missing', () => {
      const noShapeContext = {
        isCellInBounds: () => true,
        getCellValue: () => 0,
        iterateRange: () => [1],
      };
      const colRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [{ kind: 'columnRange' as const, startCol: 0, endCol: 0 }],
      } as any;
      const result = evaluator.evaluate(colRangeArgAST, noShapeContext as any);
      expect(result).toEqual({ kind: 'error', code: '#REF!' });
    });

    it('RowRange falls back to default sheet shape when getSheetShape is missing', () => {
      const noShapeContext = {
        isCellInBounds: () => true,
        getCellValue: () => 0,
        iterateRange: () => [1],
      };
      const rowRangeArgAST = {
        kind: 'call' as const,
        name: 'SUM',
        args: [{ kind: 'rowRange' as const, startRow: 0, endRow: 0 }],
      } as any;
      const result = evaluator.evaluate(rowRangeArgAST, noShapeContext as any);
      expect(result).toEqual({ kind: 'error', code: '#REF!' });
    });
  });

  describe('toDisplayString with FormulaError (line 343)', () => {
    it('concatenating a FormulaError returns empty string contribution', () => {
      // FormulaError should return '' from toDisplayString
      // But &-concat stops at error propagation, so we use a custom fn
      // to access toDisplayString indirectly with error value via string concat
      // Error value gets propagated BEFORE toDisplayString is called
      // To hit line 343, we need a value that passes isFormulaError()==false but isFormulaText()==false
      // This is the FormulaText path at line 342 and the fallback at 343
      // FormulaError is caught in evaluateBinary before reaching toDisplayString
      // We need to hit line 343 via a value not number, string, bool, FormulaText, or FormulaError
      // Create a custom "unknown" object via a custom function returning it
      const customFn = {
        name: 'CUSTOM_VAL',
        evaluate: () => ({ unknownType: true }), // not a recognized FormulaValue shape
      };
      evaluator.registerFunction(customFn as any);
      // The evaluateCall returns this, then binary & calls toDisplayString on it
      // which hits the fallback return ''
      const customConcatAST = {
        kind: 'binary' as const,
        op: '&',
        left: {
          kind: 'call' as const,
          name: 'CUSTOM_VAL',
          args: [],
        },
        right: { kind: 'string' as const, value: 'test' },
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(customConcatAST, context);
      expect(result).toBe('test'); // '' + 'test'
    });
  });

  describe('compareValues typeOrder=3 and fallback (lines 361, 383)', () => {
    it('typeOrder returns 3 for unknown value type, same-type fallback returns 0 (equal)', () => {
      // Register a function that returns an unknown/unrecognized value shape
      // typeOrder will return 3 (the default), and comparing two such values
      // will fall through all same-type checks → return 0 → = comparison returns true
      const unknownVal = { unknownType: true };
      const customFn = {
        name: 'UNKNOWN_VAL',
        evaluate: () => unknownVal,
      };
      evaluator.registerFunction(customFn as any);

      const compareAST = {
        kind: 'binary' as const,
        op: '=',
        left: { kind: 'call' as const, name: 'UNKNOWN_VAL', args: [] },
        right: { kind: 'call' as const, name: 'UNKNOWN_VAL', args: [] },
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(compareAST, context);
      // Both typeOrder = 3, lt === rt, falls through all same-type checks → return 0 → equal → true
      expect(result).toBe(true);
    });

    it('typeOrder returns 3 for unknown values: one unknown < another = false', () => {
      const unknownVal = { unknownType: true };
      const customFn = {
        name: 'UNKNOWN_VAL2',
        evaluate: () => unknownVal,
      };
      evaluator.registerFunction(customFn as any);

      const compareAST = {
        kind: 'binary' as const,
        op: '<',
        left: { kind: 'call' as const, name: 'UNKNOWN_VAL2', args: [] },
        right: { kind: 'call' as const, name: 'UNKNOWN_VAL2', args: [] },
      } as any;
      const context = createMockContext({});
      const result = evaluator.evaluate(compareAST, context);
      // Both typeOrder = 3, fallback return 0, so 0 < 0 = false
      expect(result).toBe(false);
    });
  });
});
