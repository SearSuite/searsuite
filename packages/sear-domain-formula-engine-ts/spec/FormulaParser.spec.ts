import { FormulaParser } from '../src/FormulaParser';
import {
  FormulaErrorCode,
  FormulaNodeKind,
  StructureChangeAxis,
  type FormulaAST,
  type StructureChange,
} from '@searsuite/sear-domain-formula-engine';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

describe('FormulaParser', () => {
  let parser: FormulaParser;

  beforeEach(() => {
    parser = new FormulaParser();
  });

  describe('parse', () => {
    it('parses number literal', () => {
      expect(parser.parse('=42')).toEqual({ kind: 'number', value: 42 });
    });

    it('limits formula numeric literals to 15 significant digits', () => {
      expect(parser.parse('=1234567890123456')).toEqual({ kind: 'number', value: 1234567890123450 });
      expect(parser.parse('=1.234567890123456')).toEqual({ kind: 'number', value: 1.23456789012345 });
      expect(parser.parse('=9007199254740992')).toEqual({
        kind: 'number', value: 9007199254740990, rawLiteral: '9007199254740992',
      });
    });

    it('parses formulas without a leading equals sign', () => {
      expect(parser.parse('42')).toEqual({ kind: 'number', value: 42 });
    });

    it('parses decimal number', () => {
      expect(parser.parse('=3.14')).toEqual({ kind: 'number', value: 3.14 });
    });

    it('parses scientific notation', () => {
      expect(parser.parse('=1e-12')).toEqual({ kind: 'number', value: 1e-12 });
      expect(parser.parse('=1E+12')).toEqual({ kind: 'number', value: 1e12 });
      expect(parser.parse('=.5e2')).toEqual({ kind: 'number', value: 50 });
      expect(parser.parse('=1.e2')).toEqual({ kind: 'number', value: 100 });
    });

    it('parses string literal', () => {
      expect(parser.parse('="hello"')).toEqual({
        kind: 'string',
        value: 'hello',
      });
    });

    it('parses Excel-style escaped double quotes in string literals', () => {
      expect(parser.parse('="a""b"')).toEqual({
        kind: 'string',
        value: 'a"b',
      });
      expect(parser.parse('=""""')).toEqual({
        kind: 'string',
        value: '"',
      });
    });

    it('parses boolean TRUE', () => {
      expect(parser.parse('=TRUE')).toEqual({ kind: 'boolean', value: true });
    });

    it('parses boolean FALSE', () => {
      expect(parser.parse('=FALSE')).toEqual({ kind: 'boolean', value: false });
    });

    it('parses persisted reference errors inside expressions', () => {
      const ast = parser.parse('=SUM(#REF!,A1)');
      expect(ast).toEqual({
        kind: FormulaNodeKind.Call,
        name: 'SUM',
        args: [
          { kind: FormulaNodeKind.Error, code: FormulaErrorCode.Reference },
          { kind: FormulaNodeKind.Cell, row: 0, col: 0, absRow: false, absCol: false },
        ],
      });
      expect(parser.extractDependencies(ast)).toEqual([{ kind: FormulaNodeKind.Cell, row: 0, col: 0 }]);
    });

    it('parses cell reference A1', () => {
      expect(parser.parse('=A1')).toEqual({
        kind: 'cell',
        row: 0,
        col: 0,
        absRow: false,
        absCol: false,
      });
    });

    it('parses absolute reference $A$1', () => {
      expect(parser.parse('=$A$1')).toEqual({
        kind: 'cell',
        row: 0,
        col: 0,
        absRow: true,
        absCol: true,
      });
    });

    it('parses range reference A1:C3', () => {
      expect(parser.parse('=A1:C3')).toEqual({
        kind: 'range',
        start: [0, 0],
        end: [2, 2],
        absStartRow: false,
        absStartCol: false,
        absEndRow: false,
        absEndCol: false,
      });
    });

    it('BUG-662 normalizes reversed range corners and keeps axis-specific absolute flags', () => {
      const ast = parser.parse('=SUM(F$26:$E25)');
      expect(ast.kind).toBe(FormulaNodeKind.Call);
      if (ast.kind !== FormulaNodeKind.Call) return;
      expect(ast.args[0]).toEqual({
        kind: FormulaNodeKind.Range, start: [24, 4], end: [25, 5],
        absStartRow: false, absStartCol: true, absEndRow: true, absEndCol: false,
      });
      expect(parser.extractDependencies(ast)).toEqual([
        { kind: FormulaNodeKind.Range, start: [24, 4], end: [25, 5] },
      ]);
      expect(parser.parse('=Sheet2!F26:E25')).toMatchObject({
        kind: FormulaNodeKind.WorkbookRange, sheetName: 'Sheet2', start: [24, 4], end: [25, 5],
      });
    });

    it('retains whitespace intersections between references', () => {
      const ast = parser.parse('=AREAS(B2:D4 B2)');
      expect(ast.kind).toBe(FormulaNodeKind.Call);
      if (ast.kind !== FormulaNodeKind.Call) return;
      expect(ast.args[0]?.kind).toBe(FormulaNodeKind.Intersection);
      expect(parser.extractDependencies(ast)).toEqual([
        { kind: FormulaNodeKind.Range, start: [1, 1], end: [3, 3] },
        { kind: FormulaNodeKind.Cell, row: 1, col: 1 },
      ]);
    });

    it('parses workbook cell references with display sheet names', () => {
      expect(parser.parse('=Sheet2!A1')).toEqual({
        kind: FormulaNodeKind.WorkbookCell,
        sheetName: 'Sheet2',
        row: 0,
        col: 0,
        absRow: false,
        absCol: false,
      });
    });

    it('parses quoted workbook range references with escaped sheet-name quotes', () => {
      expect(parser.parse("='Sales Data''s'!$A$1:B5")).toEqual({
        kind: FormulaNodeKind.WorkbookRange,
        sheetName: "Sales Data's",
        start: [0, 0],
        end: [4, 1],
        absStartRow: true,
        absStartCol: true,
        absEndRow: false,
        absEndCol: false,
      });
    });

    it('parses whole-column reference A:A', () => {
      expect(parser.parse('=A:A')).toEqual({
        kind: 'columnRange',
        startCol: 0,
        endCol: 0,
        absStartCol: false,
        absEndCol: false,
      });
    });

    it('parses absolute whole-column reference $A:$C', () => {
      expect(parser.parse('=$A:$C')).toEqual({
        kind: 'columnRange',
        startCol: 0,
        endCol: 2,
        absStartCol: true,
        absEndCol: true,
      });
    });

    it('parses addition: =A1+B1', () => {
      const ast = parser.parse('=A1+B1');
      expect(ast.kind).toBe('binary');
      if (ast.kind === 'binary') {
        expect(ast.op).toBe('+');
        expect(ast.left.kind).toBe('cell');
        expect(ast.right.kind).toBe('cell');
      }
    });

    it('parses operator precedence: =1+2*3', () => {
      const ast = parser.parse('=1+2*3');
      expect(ast.kind).toBe('binary');
      if (ast.kind === 'binary') {
        expect(ast.op).toBe('+');
        expect(ast.left).toEqual({ kind: 'number', value: 1 });
        expect(ast.right.kind).toBe('binary');
        if (ast.right.kind === 'binary') {
          expect(ast.right.op).toBe('*');
          expect(ast.right.left).toEqual({ kind: 'number', value: 2 });
          expect(ast.right.right).toEqual({ kind: 'number', value: 3 });
        }
      }
    });

    it('parses addition before comparison and concatenation', () => {
      const comparison = parser.parse('=1+2=3');
      expect(comparison).toMatchObject({
        kind: FormulaNodeKind.Binary, op: '=',
        left: { kind: FormulaNodeKind.Binary, op: '+' },
      });
      const concat = parser.parse('=1+2&3');
      expect(concat).toMatchObject({
        kind: FormulaNodeKind.Binary, op: '&',
        left: { kind: FormulaNodeKind.Binary, op: '+' },
      });
      const concatFirst = parser.parse('="a"&1+2');
      expect(concatFirst).toMatchObject({
        kind: FormulaNodeKind.Binary, op: '&',
        right: { kind: FormulaNodeKind.Binary, op: '+' },
      });
    });

    it('parses parentheses: =(1+2)*3', () => {
      const ast = parser.parse('=(1+2)*3');
      expect(ast.kind).toBe('binary');
      if (ast.kind === 'binary') {
        expect(ast.op).toBe('*');
        expect(ast.left.kind).toBe('binary');
        if (ast.left.kind === 'binary') {
          expect(ast.left.op).toBe('+');
        }
        expect(ast.right).toEqual({ kind: 'number', value: 3 });
      }
    });

    it('parses unary minus: =-5', () => {
      const ast = parser.parse('=-5');
      expect(ast).toEqual({
        kind: 'unary',
        op: '-',
        operand: { kind: 'number', value: 5 },
      });
    });

    it('parses percentage: =50%', () => {
      const ast = parser.parse('=50%');
      expect(ast).toEqual({
        kind: 'unary',
        op: '%',
        operand: { kind: 'number', value: 50 },
      });
    });

    it('parses consecutive postfix percentages', () => {
      expect(parser.parse('=100%%')).toEqual({
        kind: FormulaNodeKind.Unary, op: '%', operand: {
          kind: FormulaNodeKind.Unary, op: '%', operand: { kind: FormulaNodeKind.Number, value: 100 },
        },
      });
    });

    it('preserves punctuation and smart quotes inside string literals', () => {
      const ast = parser.parse('=EXACT("，",",")');
      expect(ast).toMatchObject({
        kind: FormulaNodeKind.Call,
        args: [{ kind: FormulaNodeKind.String, value: '，' }, { kind: FormulaNodeKind.String, value: ',' }],
      });
      expect(parser.parse('=LEN("“好”")')).toMatchObject({
        kind: FormulaNodeKind.Call, args: [{ kind: FormulaNodeKind.String, value: '“好”' }],
      });
      expect(parser.parse('=LEN(“好”)')).toMatchObject({
        kind: FormulaNodeKind.Call, args: [{ kind: FormulaNodeKind.String, value: '好' }],
      });
    });

    it('parses prefix unary with postfix percentage', () => {
      const ast = parser.parse('=-5%');
      expect(ast).toEqual({
        kind: 'unary',
        op: '-',
        operand: {
          kind: 'unary',
          op: '%',
          operand: { kind: 'number', value: 5 },
        },
      });
    });

    it('supports chained postfix percentages on unary expressions', () => {
      const ast = parser.parse('=-5%%');
      expect(ast).toMatchObject({
        kind: FormulaNodeKind.Unary, op: '-', operand: {
          kind: FormulaNodeKind.Unary, op: '%', operand: {
            kind: FormulaNodeKind.Unary, op: '%', operand: { kind: FormulaNodeKind.Number, value: 5 },
          },
        },
      });
    });

    it('parses function call: =SUM(A1:A3)', () => {
      const ast = parser.parse('=SUM(A1:A3)');
      expect(ast.kind).toBe('call');
      if (ast.kind === 'call') {
        expect(ast.name).toBe('SUM');
        expect(ast.args.length).toBe(1);
        expect(ast.args[0].kind).toBe('range');
      }
    });

    it('parses empty function call argument lists', () => {
      const ast = parser.parse('=SUM()');
      expect(ast.kind).toBe('call');
      if (ast.kind === 'call') {
        expect(ast.name).toBe('SUM');
        expect(ast.args).toEqual([]);
      }
    });

    it('parses direct and chained expression invocations', () => {
      const direct = parser.parse('=F(x,x+1)(3)');
      expect(direct.kind).toBe(FormulaNodeKind.Invoke);
      if (direct.kind === FormulaNodeKind.Invoke) {
        expect(direct.callee).toMatchObject({ kind: FormulaNodeKind.Call, name: 'F' });
        expect(direct.args).toEqual([{ kind: FormulaNodeKind.Number, value: 3 }]);
      }

      const chained = parser.parse('=F(x,F(y,x+y))(1)(2)');
      expect(chained.kind).toBe(FormulaNodeKind.Invoke);
      if (chained.kind === FormulaNodeKind.Invoke) {
        expect(chained.callee.kind).toBe(FormulaNodeKind.Invoke);
      }
    });

    it('parses function with multiple args: =IF(A1>0,A1,0)', () => {
      const ast = parser.parse('=IF(A1>0,A1,0)');
      expect(ast.kind).toBe('call');
      if (ast.kind === 'call') {
        expect(ast.name).toBe('IF');
        expect(ast.args.length).toBe(3);
      }
    });

    it('parses comparison: =A1>B1', () => {
      const ast = parser.parse('=A1>B1');
      expect(ast.kind).toBe('binary');
      if (ast.kind === 'binary') {
        expect(ast.op).toBe('>');
      }
    });

    it('parses consecutive comparisons from left to right', () => {
      expect(parser.parse('=1<2<3')).toMatchObject({
        kind: FormulaNodeKind.Binary, op: '<',
        left: { kind: FormulaNodeKind.Binary, op: '<' },
      });
    });

    it('enforces the 64 nested function limit', () => {
      const nested = (count: number) => `=${'ABS('.repeat(count)}1${')'.repeat(count)}`;
      expect(parser.parse(nested(64)).kind).toBe(FormulaNodeKind.Call);
      expect(() => parser.parse(nested(65))).toThrow('Formula exceeds 64 nested functions');
      expect(parser.parse('=ABS(1)').kind).toBe(FormulaNodeKind.Call);
    });

    it('enforces the 1024 operand limit', () => {
      const sum = (count: number) => `=${Array(count).fill('1').join('+')}`;
      expect(parser.parse(sum(1024)).kind).toBe(FormulaNodeKind.Binary);
      expect(() => parser.parse(sum(1025))).toThrow('Formula exceeds 1024 operands');
      expect(parser.parse('=(1)+(2)').kind).toBe(FormulaNodeKind.Binary);
    });

    it('enforces the 8192 character limit', () => {
      const longText = (count: number) => `=LEN("${'A'.repeat(count)}")`;
      expect(longText(8184)).toHaveLength(8192);
      expect(parser.parse(longText(8184)).kind).toBe(FormulaNodeKind.Call);
      expect(() => parser.parse(longText(8185))).toThrow('Formula exceeds 8192 characters');
    });

    it('parses string concat: ="a"&"b"', () => {
      const ast = parser.parse('="a"&"b"');
      expect(ast.kind).toBe('binary');
      if (ast.kind === 'binary') {
        expect(ast.op).toBe('&');
      }
    });

    it('parses nested function: =SUM(IF(A1:A3>0,A1:A3,0))', () => {
      const ast = parser.parse('=SUM(IF(A1:A3>0,A1:A3,0))');
      expect(ast.kind).toBe('call');
      if (ast.kind === 'call') {
        expect(ast.name).toBe('SUM');
        expect(ast.args[0].kind).toBe('call');
        if (ast.args[0].kind === 'call') {
          expect(ast.args[0].name).toBe('IF');
        }
      }
    });

    it('handles whitespace', () => {
      const ast = parser.parse('= A1 + B1 ');
      expect(ast.kind).toBe('binary');
    });

    it('throws on invalid syntax', () => {
      expect(() => parser.parse('=')).toThrow();
      expect(() => parser.parse('=1+')).toThrow();
      expect(() => parser.parse('=(1+2')).toThrow();
    });

    it('throws on invalid numeric and string literals', () => {
      expect(() => parser.parse('=.')).toThrow(/Invalid number/);
      expect(() => parser.parse('=1e')).toThrow(/Invalid number/);
      expect(() => parser.parse('=1e+')).toThrow(/Invalid number/);
      expect(() => parser.parse('=1.2.3')).toThrow(/Invalid number/);
      expect(() => parser.parse('=1e309')).toThrow(/Invalid number/);
      expect(() => parser.parse('="unterminated')).toThrow(/Unterminated string literal/);
      expect(() => parser.parse('="""')).toThrow(/Unterminated string literal/);
    });

    it('throws on malformed function and column-range references', () => {
      expect(() => parser.parse('=SUM(1,2')).toThrow(/Expected '\)' after function arguments/);
      expect(() => parser.parse('=A:$')).toThrow(/Invalid column reference/);
    });

    it('parses row ranges and throws when row-range tail is malformed', () => {
      expect(parser.parse('=1:3')).toEqual({
        kind: 'rowRange',
        startRow: 0,
        endRow: 2,
        absStartRow: false,
        absEndRow: false,
      });

      expect(parser.parse('=1:$3')).toEqual({
        kind: 'rowRange',
        startRow: 0,
        endRow: 2,
        absStartRow: false,
        absEndRow: true,
      });

      expect(() => parser.parse('=1:$')).toThrow();
    });
  });

  describe('extractDependencies', () => {
    it('indexes literal INDIRECT A1 references for calculation order', () => {
      expect(parser.extractDependencies(parser.parse('=INDIRECT("K177")'))).toEqual([
        { kind: FormulaNodeKind.Cell, row: 176, col: 10 },
      ]);
      expect(parser.extractDependencies(parser.parse('=INDIRECT("K175:K178")'))).toEqual([
        { kind: FormulaNodeKind.Range, start: [174, 10], end: [177, 10] },
      ]);
      expect(parser.extractDependencies(parser.parse('=INDIRECT("R1C1",FALSE)'))).toEqual([]);
    });

    it('extracts single cell dependency', () => {
      const ast = parser.parse('=A1');
      const deps = parser.extractDependencies(ast);
      expect(deps).toEqual([{ kind: 'cell', row: 0, col: 0 }]);
    });

    it('extracts range dependency (not expanded)', () => {
      const ast = parser.parse('=SUM(A1:C3)');
      const deps = parser.extractDependencies(ast);
      expect(deps).toEqual([
        {
          kind: 'range',
          start: [0, 0],
          end: [2, 2],
        },
      ]);
    });

    it('extracts whole-column dependency', () => {
      const ast = parser.parse('=SUM(A:A)');
      const deps = parser.extractDependencies(ast);
      expect(deps).toEqual([
        {
          kind: 'columnRange',
          startCol: 0,
          endCol: 0,
        },
      ]);
    });

    it('extracts whole-row dependency', () => {
      const ast = parser.parse('=SUM(1:3)');
      const deps = parser.extractDependencies(ast);
      expect(deps).toEqual([
        {
          kind: 'rowRange',
          startRow: 0,
          endRow: 2,
        },
      ]);
    });

    it('extracts multiple dependencies', () => {
      const ast = parser.parse('=A1+B2+C3');
      const deps = parser.extractDependencies(ast);
      expect(deps.length).toBe(3);
      expect(deps[0]).toEqual({ kind: 'cell', row: 0, col: 0 });
      expect(deps[1]).toEqual({ kind: 'cell', row: 1, col: 1 });
      expect(deps[2]).toEqual({ kind: 'cell', row: 2, col: 2 });
    });

    it('extracts dependencies from nested functions', () => {
      const ast = parser.parse('=SUM(A1:A3)+B5');
      const deps = parser.extractDependencies(ast);
      expect(deps.length).toBe(2);
      expect(deps[0]).toEqual({ kind: 'range', start: [0, 0], end: [2, 0] });
      expect(deps[1]).toEqual({ kind: 'cell', row: 4, col: 1 });
    });

    it('extracts dependencies from invocation callees and arguments', () => {
      expect(parser.extractDependencies(parser.parse('=F(x,x+A1)(B1)'))).toEqual([
        { kind: FormulaNodeKind.Cell, row: 0, col: 0 },
        { kind: FormulaNodeKind.Cell, row: 0, col: 1 },
      ]);
    });

    it('returns empty for literals', () => {
      expect(parser.extractDependencies(parser.parse('=42'))).toEqual([]);
      expect(parser.extractDependencies(parser.parse('="hello"'))).toEqual([]);
      expect(parser.extractDependencies(parser.parse('=TRUE'))).toEqual([]);
    });

    it('extracts dependencies through unary nodes', () => {
      expect(parser.extractDependencies(parser.parse('=-A1'))).toEqual([{ kind: 'cell', row: 0, col: 0 }]);
    });
  });

  describe('shiftReferences', () => {
    it('shifts cell reference on insertRow', () => {
      const ast = parser.parse('=A2') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted.kind).toBe('cell');
      if (shifted.kind === 'cell') {
        expect(shifted.row).toBe(2); // row 1 → row 2
        expect(shifted.col).toBe(0);
      }
    });

    it('does not shift absolute reference on insertRow', () => {
      const ast = parser.parse('=$A$2') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted).toBe(ast); // unchanged
    });

    it('shifts on deleteRow (above deleted range)', () => {
      const ast = parser.parse('=A5') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowDelete, index: 1, count: 2 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted.kind).toBe('cell');
      if (shifted.kind === 'cell') {
        expect(shifted.row).toBe(2); // row 4 → row 2
      }
    });

    it('produces #REF! when referenced row is deleted', () => {
      const ast = parser.parse('=A3') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowDelete, index: 2, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted.kind).toBe('cell');
      if (shifted.kind === 'cell') {
        expect(shifted.row).toBe(-1); // #REF! sentinel
      }
    });

    it('shifts on insertCol', () => {
      const ast = parser.parse('=B1') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.ColInsert, index: 0, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted.kind).toBe('cell');
      if (shifted.kind === 'cell') {
        expect(shifted.col).toBe(2); // col 1 → col 2
      }
    });

    it('shifts range references', () => {
      const ast = parser.parse('=SUM(A1:C3)') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted.kind).toBe('call');
      if (shifted.kind === 'call') {
        const rangeArg = shifted.args[0];
        expect(rangeArg.kind).toBe('range');
        if (rangeArg.kind === 'range') {
          expect(rangeArg.start).toEqual([1, 0]); // row 0 → row 1
          expect(rangeArg.end).toEqual([3, 2]); // row 2 → row 3
        }
      }
    });

    it('shifts each range row endpoint according to its own absolute flag', () => {
      const ast = parser.parse('=SUM(A1:A$3)') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);

      expect(shifted.kind).toBe('call');
      if (shifted.kind === 'call' && shifted.args[0].kind === 'range') {
        expect(shifted.args[0].start).toEqual([1, 0]);
        expect(shifted.args[0].end).toEqual([2, 0]);
        expect(shifted.args[0].absEndRow).toBe(true);
      }
    });

    it('shifts each range column endpoint according to its own absolute flag', () => {
      const ast = parser.parse('=SUM($A1:C1)') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.ColInsert, index: 0, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);

      expect(shifted.kind).toBe('call');
      if (shifted.kind === 'call' && shifted.args[0].kind === 'range') {
        expect(shifted.args[0].start).toEqual([0, 0]);
        expect(shifted.args[0].end).toEqual([0, 3]);
        expect(shifted.args[0].absStartCol).toBe(true);
      }
    });

    it('returns original AST when no change needed', () => {
      const ast = parser.parse('=A1') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowInsert, index: 5, count: 1 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted).toBe(ast); // same reference, no change
    });

    it('shifts references in invocation callees and arguments', () => {
      const ast = parser.parse('=F(x,x+A1)(B1)');
      const shifted = parser.shiftReferences(ast, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }]);

      expect(parser.extractDependencies(shifted)).toEqual([
        { kind: FormulaNodeKind.Cell, row: 1, col: 0 },
        { kind: FormulaNodeKind.Cell, row: 1, col: 1 },
      ]);
    });

    it('swaps relative row references and keeps absolute rows fixed', () => {
      const changes: StructureChange[] = [{ type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 2 }];
      expect(parser.shiftReferences(parser.parse('=A1') as FormulaAST, changes)).toMatchObject({ row: 2, col: 0 });
      expect(parser.shiftReferences(parser.parse('=A3') as FormulaAST, changes)).toMatchObject({ row: 0, col: 0 });
      expect(parser.shiftReferences(parser.parse('=A$1') as FormulaAST, changes)).toMatchObject({ row: 0, col: 0 });
    });

    it('keeps relative cell coordinates unchanged when column changes happen after the reference', () => {
      const ast = parser.parse('=A1') as FormulaAST;
      const shifted = parser.shiftReferences(ast, [
        { type: MatrixOTActionName.ColInsert, index: 3, count: 1 },
        { type: MatrixOTActionName.ColDelete, index: 3, count: 1 },
      ]);
      expect(shifted).toBe(ast);
    });

    it('keeps relative row references unchanged when deleted rows are strictly below the reference', () => {
      const ast = parser.parse('=A1') as FormulaAST;
      const shifted = parser.shiftReferences(ast, [{ type: MatrixOTActionName.RowDelete, index: 5, count: 1 }]);
      expect(shifted).toBe(ast);
    });

    it('ignores unknown structure-change types for range references', () => {
      const ast = parser.parse('=SUM(A1:B2)') as FormulaAST;
      const shifted = parser.shiftReferences(ast, [{ type: 'unknown' as any, index: 0, count: 1 }]);
      expect(shifted).toBe(ast);
    });

    it('swaps and normalizes range endpoints for column moves', () => {
      const ast = parser.parse('=SUM(A1:B2)') as FormulaAST;
      const changes: StructureChange[] = [{ type: MatrixOTActionName.ColMove, fromIndex: 0, toIndex: 2 }];
      const shifted = parser.shiftReferences(ast, changes);
      expect(shifted).toMatchObject({
        kind: 'call',
        args: [{ kind: 'range', start: [0, 1], end: [1, 2] }],
      });
    });
    it('swaps relative column references in both directions', () => {
      const changes: StructureChange[] = [{ type: MatrixOTActionName.ColMove, fromIndex: 0, toIndex: 1 }];
      expect(parser.shiftReferences(parser.parse('=A1') as FormulaAST, changes)).toMatchObject({ row: 0, col: 1 });
      expect(parser.shiftReferences(parser.parse('=B1') as FormulaAST, changes)).toMatchObject({ row: 0, col: 0 });
    });

    it('handles column deletion for cell references', () => {
      const shifted = parser.shiftReferences(parser.parse('=C1') as FormulaAST, [
        { type: MatrixOTActionName.ColDelete, index: 0, count: 1 },
      ]);
      expect(shifted).toEqual({
        kind: 'cell',
        row: 0,
        col: 1,
        absRow: false,
        absCol: false,
      });

      const deleted = parser.shiftReferences(parser.parse('=B1') as FormulaAST, [
        { type: MatrixOTActionName.ColDelete, index: 1, count: 1 },
      ]);
      expect(deleted).toEqual({
        kind: 'cell',
        row: -1,
        col: -1,
        absRow: false,
        absCol: false,
      });
    });

    it('covers range-specific shift branches, including #REF and no-op identity', () => {
      const rangeAst = parser.parse('=A1:C3') as FormulaAST;

      const noChange = parser.shiftReferences(rangeAst, [{ type: MatrixOTActionName.RowInsert, index: 9, count: 1 }]);
      expect(noChange).toBe(rangeAst);

      const shifted = parser.shiftReferences(rangeAst, [{ type: MatrixOTActionName.ColInsert, index: 1, count: 1 }]);
      expect(shifted.kind).toBe('range');
      if (shifted.kind === 'range') {
        expect(shifted.start).toEqual([0, 0]);
        expect(shifted.end).toEqual([2, 3]);
      }

      const refError = parser.shiftReferences(rangeAst, [{ type: MatrixOTActionName.RowDelete, index: 1, count: 2 }]);
      expect(refError).toEqual({
        kind: 'range',
        start: [-1, -1],
        end: [-1, -1],
        absStartRow: false,
        absStartCol: false,
        absEndRow: false,
        absEndCol: false,
      });

      expect(
        parser.shiftReferences(rangeAst, [{ type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 3 }]),
      ).toMatchObject({ start: [2, 0], end: [3, 2] });
      expect(
        parser.shiftReferences(rangeAst, [{ type: MatrixOTActionName.ColMove, fromIndex: 0, toIndex: 3 }]),
      ).toMatchObject({ start: [0, 2], end: [2, 3] });
    });

    it('returns original nodes for unchanged unary/binary/call and unknown kinds', () => {
      const unchangedUnary = parser.parse('=-$A$1') as FormulaAST;
      expect(parser.shiftReferences(unchangedUnary, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }])).toBe(
        unchangedUnary,
      );

      const unchangedBinary = parser.parse('=$A$1+$B$2') as FormulaAST;
      expect(
        parser.shiftReferences(unchangedBinary, [{ type: MatrixOTActionName.ColInsert, index: 0, count: 1 }]),
      ).toBe(unchangedBinary);

      const unchangedCall = parser.parse('=SUM($A$1,$B$2)') as FormulaAST;
      expect(parser.shiftReferences(unchangedCall, [{ type: MatrixOTActionName.RowDelete, index: 0, count: 1 }])).toBe(
        unchangedCall,
      );

      const columnRange = parser.parse('=A:A') as FormulaAST;
      expect(parser.shiftReferences(columnRange, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }])).toBe(
        columnRange,
      );

      const rowRange = parser.parse('=1:2') as FormulaAST;
      expect(parser.shiftReferences(rowRange, [{ type: MatrixOTActionName.ColDelete, index: 0, count: 1 }])).toBe(
        rowRange,
      );

      const workbookCell = parser.parse('=Sheet2!A1') as FormulaAST;
      expect(parser.shiftReferences(workbookCell, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }])).toBe(
        workbookCell,
      );

      const workbookRange = parser.parse('=Sheet2!A1:B2') as FormulaAST;
      expect(parser.shiftReferences(workbookRange, [{ type: MatrixOTActionName.ColDelete, index: 0, count: 1 }])).toBe(
        workbookRange,
      );

      const unknownAst = { kind: 'unknown' } as unknown as FormulaAST;
      expect(parser.shiftReferences(unknownAst, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }])).toBe(
        unknownAst,
      );
    });

    it('returns new binary and unary nodes when child references change', () => {
      const binary = parser.parse('=A1+B1') as FormulaAST;
      const shiftedBinary = parser.shiftReferences(binary, [
        { type: MatrixOTActionName.RowInsert, index: 0, count: 1 },
      ]);
      expect(shiftedBinary).not.toBe(binary);

      const unary = parser.parse('=-A1') as FormulaAST;
      const shiftedUnary = parser.shiftReferences(unary, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }]);
      expect(shiftedUnary).not.toBe(unary);
    });

    it('rebases range endpoints after moving a row or deleting earlier columns', () => {
      const range = parser.parse('=F5:F5') as FormulaAST;
      expect(parser.shiftReferences(range, [{ type: MatrixOTActionName.RowMove, fromIndex: 4, toIndex: 7 }]))
        .toMatchObject({ start: [7, 5], end: [7, 5] });
      expect(parser.shiftReferences(range, [{ type: MatrixOTActionName.ColDelete, index: 2, count: 2 }]))
        .toMatchObject({ start: [4, 3], end: [4, 3] });
    });
  });
});
