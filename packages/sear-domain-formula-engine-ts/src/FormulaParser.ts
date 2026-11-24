import { SearError } from '@searsuite/sear-foundation-error';
import { parseSpreadsheetNumericLiteral } from '@searsuite/sear-domain-format';
/**
 * Formula parser: TS implementation of IFormulaParser.
 *
 * Recursive-descent parser that converts formula strings into ASTs.
 * Supports full operator precedence and Excel syntax.
 *
 * Grammar, from low to high precedence:
 *
 *   expression  → comparison
 *   comparison  → concat (('=' | '<>' | '<' | '>' | '<=' | '>=') concat)*
 *   concat      → addition (('&') addition)*
 *   addition    → term (('+' | '-') term)*
 *   term        → factor (('*' | '/') factor)*
 *   factor      → exponent (('^') exponent)*
 *   exponent    → unary | atom
 *   unary       → ('-' | '+') unary | atom
 *   atom        → number | string | boolean | array | cellRef | rangeRef | workbookRef | functionCall | '(' expression ')'
 *
 * Percent '%' is parsed as a postfix unary operator: =50% -> FormulaNodeKind.Unary.
 */

import { Injectable } from '@searsuite/sear-foundation-di';
import {
  type FormulaAST,
  type BinaryOp,
  type UnaryOp,
  FormulaErrorCode,
  FormulaNodeKind,
  type StructureChange,
  StructureChangeAxis,
  IFormulaParser,
  type Dependency,
  getStructureChangeAxis,
  shiftStructureCoordinate,
} from '@searsuite/sear-domain-formula-engine';
import { columnLabelToIndex } from '@searsuite/sear-foundation-utils';
import { parseCellRef } from './parseCellRef';
import { type ParsedCellRef } from './ParsedCellRef';

const MAX_FORMULA_LENGTH = 8192;
const MAX_FORMULA_FUNCTION_DEPTH = 64;
const MAX_FORMULA_OPERANDS = 1024;

/**
 * TypeScript implementation of the formula parser contract.
 *
 * `parse` returns an AST without evaluating the formula. The parser also
 * extracts range-level dependencies and rewrites references after structural
 * row or column changes. It rejects formulas beyond its length, nesting, and
 * operand limits instead of partially parsing them.
 */
@Injectable()
export class FormulaParser implements IFormulaParser {
  /** DI token for resolving FormulaParser. */
  public static readonly symbol = Symbol.for('FormulaParser');

  // ─── Internal State (Used Only During One parse Call) ───

  /** Formula string currently being parsed, after removing the leading '='. */
  #input: string = '';
  /** Current read position as a character index. */
  #pos: number = 0;
  #functionDepth = 0;
  #operandCount = 0;

  /**
   * Parses a formula string into an AST.
   *
   * @param formula Formula string including the leading '=', such as "=A1+B1".
   * @returns Parsed AST.
   */
  parse(formula: string): FormulaAST {
    if (formula.length > MAX_FORMULA_LENGTH) {
      throw new SearError(`Formula exceeds ${MAX_FORMULA_LENGTH} characters`);
    }
    // Remove the leading '='.
    this.#input = this.#normalizeFormulaText(formula.startsWith('=') ? formula.slice(1) : formula);
    this.#pos = 0;
    this.#functionDepth = 0;
    this.#operandCount = 0;

    const ast = this.#parseExpression();

    // Ensure the entire input has been consumed.
    this.#skipWhitespace();
    if (this.#pos < this.#input.length) {
      throw new SearError(`Unexpected character at position ${this.#pos}: '${this.#input[this.#pos]}'`);
    }

    return ast;
  }

  #normalizeFormulaText(input: string): string {
    const normalizeSyntax = (text: string): string => text
      .replace(/：/g, ':')
      .replace(/，/g, ',')
      .replace(/。/g, '.')
      .replace(/协方差\.S/g, 'COVARIANCE.S')
      .replace(/协方差\.P/g, 'COVARIANCE.P');
    let result = '';
    let syntax = '';
    let quote: 'ascii' | 'smart' | null = null;
    for (let index = 0; index < input.length; index++) {
      const character = input[index];
      if (!quote) {
        if (character === '"' || character === '“') {
          result += normalizeSyntax(syntax) + '"';
          syntax = '';
          quote = character === '“' ? 'smart' : 'ascii';
        } else {
          syntax += character;
        }
      } else if (quote === 'smart' && character === '”') {
        result += '"';
        quote = null;
      } else if (quote === 'ascii' && character === '"') {
        result += '"';
        if (input[index + 1] === '"') result += input[++index];
        else quote = null;
      } else {
        result += character;
      }
    }
    return result + normalizeSyntax(syntax);
  }

  /**
   * Extracts all dependencies from an AST.
   *
   * Traverses the AST and collects all cell/range nodes. The returned
   * Dependency list stays range-level and is not expanded per cell.
   */
  extractDependencies(ast: FormulaAST): Dependency[] {
    const deps: Dependency[] = [];
    this.#collectDeps(ast, deps);
    return deps;
  }

  /**
   * Shifts references by rewriting row/column references for structural changes.
   *
   * Uses immutable updates: creates a new AST and never mutates the original.
   * If no reference needs shifting, returns the original AST by reference.
   */
  shiftReferences(ast: FormulaAST, changes: StructureChange[]): FormulaAST {
    return this.#shiftNode(ast, changes);
  }

  // ─── Recursive-Descent Parse Methods ────────────────────

  /**
   * Parses an expression, the lowest-precedence entry point.
   *
   * expression → comparison
   */
  #parseExpression(): FormulaAST {
    return this.#parseComparison();
  }

  /**
   * Parses comparison operations.
   *
   * comparison → concat (('=' | '<>' | '<' | '>' | '<=' | '>=') concat)*
   */
  #parseComparison(): FormulaAST {
    let left = this.#parseConcat();

    while (true) {
      this.#skipWhitespace();

      // Check two-character operators.
      const twoChar = this.#input.substring(this.#pos, this.#pos + 2);
      if (twoChar === '<>' || twoChar === '<=' || twoChar === '>=') {
        this.#advance();
        this.#advance();
        const op = twoChar as BinaryOp;
        const right = this.#parseConcat();
        left = { kind: FormulaNodeKind.Binary, op, left, right };
        continue;
      }

      // Check one-character operators.
      const ch = this.#peek();
      if (ch === '=' || ch === '<' || ch === '>') {
        this.#advance();
        const op = ch as BinaryOp;
        const right = this.#parseConcat();
        left = { kind: FormulaNodeKind.Binary, op, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Parses string concatenation.
   *
   * concat → addition (('&') addition)*
   */
  #parseConcat(): FormulaAST {
    let left = this.#parseAddition();

    while (true) {
      this.#skipWhitespace();
      if (this.#peek() === '&') {
        this.#advance();
        const right = this.#parseAddition();
        left = { kind: FormulaNodeKind.Binary, op: '&', left, right };
      } else {
        break;
      }
    }

    return left;
  }

  /** addition → term (('+' | '-') term)* */
  #parseAddition(): FormulaAST {
    let left = this.#parseTerm();

    while (true) {
      this.#skipWhitespace();
      const ch = this.#peek();
      if (ch !== '+' && ch !== '-') break;
      this.#advance();
      const right = this.#parseTerm();
      left = { kind: FormulaNodeKind.Binary, op: ch as BinaryOp, left, right };
    }

    return left;
  }

  /**
   * Parses multiplication and division.
   *
   * term → factor (('*' | '/') factor)*
   */
  #parseTerm(): FormulaAST {
    let left = this.#parseFactor();

    while (true) {
      this.#skipWhitespace();
      const ch = this.#peek();
      if (ch === '*' || ch === '/') {
        this.#advance();
        const op = ch as BinaryOp;
        const right = this.#parseFactor();
        left = { kind: FormulaNodeKind.Binary, op, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Parses exponentiation.
   *
   * factor → exponent (('^') exponent)*
   */
  #parseFactor(): FormulaAST {
    let left = this.#parseExponent();

    while (true) {
      this.#skipWhitespace();
      if (this.#peek() === '^') {
        this.#advance();
        const right = this.#parseExponent();
        left = { kind: FormulaNodeKind.Binary, op: '^', left, right };
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Parses unary operators.
   *
   * exponent → unary | atom
   * unary → ('-' | '+') unary | atom invocation* '%'?
   * invocation → '(' arguments? ')'
   */
  #parseExponent(): FormulaAST {
    this.#skipWhitespace();
    const ch = this.#peek();

    // Prefix unary operator: - or +.
    if (ch === '-' || ch === '+') {
      this.#advance();
      const operand = this.#parseExponent();
      let result: FormulaAST = {
        kind: FormulaNodeKind.Unary,
        op: ch as UnaryOp,
        operand,
      };

      // Check postfix percent: -50% -> unary('%', unary('-', 50)).
      this.#skipWhitespace();
      if (this.#peek() === '%') {
        this.#advance();
        result = { kind: FormulaNodeKind.Unary, op: '%', operand: result };
      }
      return result;
    }

    // Atom expression, possibly followed by invocation or postfix percent operators.
    let result = this.#parseAtom();

    while (true) {
      const beforeWhitespace = this.#pos;
      this.#skipWhitespace();
      if (this.#peek() === '#') {
        if (result.kind !== FormulaNodeKind.Cell && result.kind !== FormulaNodeKind.WorkbookCell) {
          throw new SearError(`Expected a cell reference before '#' at position ${this.#pos}`);
        }
        this.#advance();
        result = { kind: FormulaNodeKind.Spill, reference: result };
        continue;
      }
      if (this.#pos > beforeWhitespace && isReferenceExpression(result) && isReferenceStart(this.#peek())) {
        const right = this.#parseAtom();
        if (!isReferenceExpression(right)) throw new SearError(`Expected a reference at position ${this.#pos}`);
        result = { kind: FormulaNodeKind.Intersection, left: result, right };
        continue;
      }
      if (this.#peek() === '(') {
        result = { kind: FormulaNodeKind.Invoke, callee: result, args: this.#parseCallArguments() };
        continue;
      }
      break;
    }

    while (this.#peek() === '%') {
      this.#advance();
      result = { kind: FormulaNodeKind.Unary, op: '%', operand: result };
    }

    return result;
  }

  /**
   * Parses an atom expression.
   *
   * atom → number | string | boolean | cellRef | rangeRef | workbookRef | functionCall | '(' expression ')'
   */
  #parseAtom(): FormulaAST {
    this.#skipWhitespace();
    const grouping = this.#peek() === '(' || this.#peek() === '{';
    const atom = this.#parseAtomSyntax();
    if (!grouping && atom.kind !== FormulaNodeKind.Call) {
      this.#operandCount++;
      if (this.#operandCount > MAX_FORMULA_OPERANDS) {
        throw new SearError(`Formula exceeds ${MAX_FORMULA_OPERANDS} operands`);
      }
    }
    return atom;
  }

  #parseAtomSyntax(): FormulaAST {
    this.#skipWhitespace();
    const ch = this.#peek();

    // Parenthesized expression or tuple: (expression) / (expression, expression).
    if (ch === '(') {
      this.#advance(); // Consume '('.
      const items = [this.#parseExpression()];
      this.#skipWhitespace();
      while (this.#peek() === ',') {
        this.#advance();
        items.push(this.#parseExpression());
        this.#skipWhitespace();
      }
      if (this.#peek() !== ')') {
        throw new SearError(`Expected ')' at position ${this.#pos}`);
      }
      this.#advance(); // Consume ')'.
      return items.length === 1 ? items[0] : { kind: FormulaNodeKind.Tuple, items };
    }

    // String literal: "hello".
    if (ch === '"') {
      return this.#parseStringLiteral();
    }

    if (ch === '#') {
      const code = Object.values(FormulaErrorCode).find((value) =>
        this.#input.slice(this.#pos, this.#pos + value.length).toUpperCase() === value);
      if (code) {
        this.#pos += code.length;
        return { kind: FormulaNodeKind.Error, code };
      }
    }

    // Array constant: {1,2;3,4}.
    if (ch === '{') {
      return this.#parseArrayConstant();
    }

    // Quoted workbook reference: 'Sales Data'!A1 or 'Sales Data'!A1:B5.
    if (ch === "'") {
      const sheetName = this.#parseQuotedSheetName();
      this.#skipWhitespace();
      if (this.#peek() !== '!') throw new SearError(`Expected '!' after quoted sheet name at position ${this.#pos}`);
      this.#advance();
      return this.#parseWorkbookCellOrRangeRef(sheetName);
    }

    // Numeric literal: 42, 3.14, or a whole-row reference: 1:3.
    if (ch !== void 0 && /[0-9.]/.test(ch)) {
      const rowRange = this.#tryParseRowRange();
      if (rowRange) return rowRange;
      return this.#parseNumberLiteral();
    }

    // Identifier: may be a function name, boolean, or cell reference.
    // Function name: SUM, IF, ... followed by '('.
    // Boolean: TRUE, FALSE.
    // Cell reference: A1, $A$1, AA10.
    // Range reference: A1:C3.
    if (ch !== void 0 && /[A-Za-z_$]/.test(ch)) {
      return this.#parseIdentifier();
    }

    throw new SearError(`Unexpected character at position ${this.#pos}: '${ch}'`);
  }

  // ─── Atom Parse Helpers ─────────────────────────────────

  /**
   * Parses a numeric literal.
   */
  #parseNumberLiteral(): FormulaAST {
    const remaining = this.#input.slice(this.#pos);
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(remaining);
    const literal = match?.[0];
    if (!literal || ['.', 'e', 'E'].includes(remaining[literal.length] ?? '')) {
      throw new SearError(`Invalid number at position ${this.#pos}`);
    }
    const value = parseSpreadsheetNumericLiteral(literal);
    if (!Number.isFinite(value)) throw new SearError(`Invalid number: ${literal}`);
    this.#pos += literal.length;
    // Preserve an over-limit source for functions that validate argument bounds.
    const rawLiteral = Number(literal) > Number.MAX_SAFE_INTEGER ? literal : undefined;
    return { kind: FormulaNodeKind.Number, value, ...(rawLiteral ? { rawLiteral } : {}) };
  }

  /**
   * Parses a string literal wrapped in double quotes.
   */
  #parseStringLiteral(): FormulaAST {
    this.#advance(); // Consume the opening '"'.
    let value = '';
    while (this.#pos < this.#input.length) {
      if (this.#input[this.#pos] !== '"') {
        value += this.#input[this.#pos];
        this.#pos++;
        continue;
      }
      if (this.#input[this.#pos + 1] === '"') {
        value += '"';
        this.#pos += 2;
        continue;
      }
      this.#advance(); // Consume the closing '"'.
      return { kind: FormulaNodeKind.String, value };
    }
    throw new SearError('Unterminated string literal');
  }

  /** Parses an Excel-style array constant into rows of scalar AST nodes. */
  #parseArrayConstant(): FormulaAST {
    this.#advance(); // Consume '{'.
    const rows: FormulaAST[][] = [];
    let row: FormulaAST[] = [];

    while (true) {
      this.#skipWhitespace();
      if (this.#peek() === void 0) throw new SearError(`Unterminated array constant at position ${this.#pos}`);
      if (this.#peek() === '}') {
        if (row.length === 0) throw new SearError(`Empty array constant at position ${this.#pos}`);
        rows.push(row);
        this.#advance();
        const width = rows[0]?.length ?? 0;
        if (width === 0 || rows.some((candidate) => candidate.length !== width)) {
          throw new SearError('Array constant rows must have the same width');
        }
        return { kind: FormulaNodeKind.Array, rows };
      }

      row.push(this.#parseExpression());
      this.#skipWhitespace();
      const separator = this.#peek();
      if (separator === ',') {
        this.#advance();
        this.#skipWhitespace();
        if (this.#peek() === ',' || this.#peek() === ';' || this.#peek() === '}') {
          throw new SearError(`Missing array constant value at position ${this.#pos}`);
        }
        continue;
      }
      if (separator === ';') {
        this.#advance();
        rows.push(row);
        row = [];
        continue;
      }
      if (separator === '}') {
        rows.push(row);
        this.#advance();
        const width = rows[0]?.length ?? 0;
        if (width === 0 || rows.some((candidate) => candidate.length !== width)) {
          throw new SearError('Array constant rows must have the same width');
        }
        return { kind: FormulaNodeKind.Array, rows };
      }
      throw new SearError(`Expected ',', ';' or '}' in array constant at position ${this.#pos}`);
    }
  }

  /**
   * Parses an identifier.
   *
   * May be:
   * 1. Workbook reference: Sheet2!A1, Sheet2!A1:B5.
   * 2. Function call: SUM(...) when the identifier is followed by '('.
   * 3. Boolean: TRUE / FALSE.
   * 4. Whole-column reference: A:A, $A:$C.
   * 5. Cell/range reference: A1, $A$1, A1:C3.
   */
  #parseIdentifier(): FormulaAST {
    // Read the identifier.
    let name = '';
    while (this.#pos < this.#input.length && /[A-Za-z0-9_$.]/.test(this.#input[this.#pos])) {
      name += this.#input[this.#pos];
      this.#pos++;
    }

    const identifierEnd = this.#pos;
    this.#skipWhitespace();

    // Workbook reference: display sheet name followed by '!'.
    if (this.#peek() === '!') {
      this.#advance();
      return this.#parseWorkbookCellOrRangeRef(name);
    }

    if (this.#peek() === ':') {
      const secondSheet = /^:([A-Za-z_][A-Za-z0-9_$.]*)!/.exec(this.#input.slice(this.#pos));
      if (secondSheet) {
        this.#pos += secondSheet[0].length;
        return this.#parseWorkbookCellOrRangeRef(`${name}:${secondSheet[1]}`);
      }
    }

    if (this.#peek() === '[') {
      const start = this.#pos;
      let depth = 0;
      while (this.#pos < this.#input.length) {
        const token = this.#input[this.#pos++];
        if (token === '[') depth += 1;
        else if (token === ']' && --depth === 0) break;
      }
      if (depth !== 0) throw new SearError(`Unterminated structured reference at position ${start}`);
      return { kind: FormulaNodeKind.Name, name: `${name}${this.#input.slice(start, this.#pos)}` };
    }

    // Check whether this is a function call: identifier followed by '('.
    if (this.#peek() === '(') {
      return this.#parseFunctionCall(name);
    }

    // Check whether this is a boolean.
    const upper = name.toUpperCase();
    if (upper === 'TRUE') return { kind: FormulaNodeKind.Boolean, value: true };
    if (upper === 'FALSE') return { kind: FormulaNodeKind.Boolean, value: false };

    if (this.#peek() === ':' && this.#isColumnRef(name)) {
      return this.#parseColumnRangeRef(name);
    }

    // Otherwise, it is a cell/range reference or an unqualified name.
    if (/^\$?[A-Za-z]{1,3}\$?[1-9][0-9]*$/.test(name)) {
      if (this.#peek() !== ':') this.#pos = identifierEnd;
      return this.#parseCellOrRangeRef(name);
    }
    return { kind: FormulaNodeKind.Name, name: upper };
  }

  #parseColumnRangeRef(firstPart: string): FormulaAST {
    const first = this.#parseSingleColumnRef(firstPart);
    this.#advance(); // Consume ':'.

    let secondName = '';
    while (this.#pos < this.#input.length && /[A-Za-z_$]/.test(this.#input[this.#pos])) {
      secondName += this.#input[this.#pos];
      this.#pos++;
    }
    const second = this.#parseSingleColumnRef(secondName);
    const startCol = Math.min(first.col, second.col);
    const endCol = Math.max(first.col, second.col);
    return {
      kind: FormulaNodeKind.ColumnRange,
      startCol,
      endCol,
      absStartCol: first.absCol,
      absEndCol: second.absCol,
    };
  }

  #tryParseRowRange(): FormulaAST | null {
    const startPos = this.#pos;
    const first = this.#readRowRef();
    if (!first || this.#peek() !== ':') {
      this.#pos = startPos;
      return null;
    }

    this.#advance(); // Consume ':'.
    const second = this.#readRowRef();
    if (!second) {
      this.#pos = startPos;
      return null;
    }

    const startRow = Math.min(first.row, second.row);
    const endRow = Math.max(first.row, second.row);
    return {
      kind: FormulaNodeKind.RowRange,
      startRow,
      endRow,
      absStartRow: first.absRow,
      absEndRow: second.absRow,
    };
  }

  /**
   * Parses a function call.
   *
   * functionCall → name '(' (expression (',' expression)*)? ')'
   */
  #parseFunctionCall(name: string): FormulaAST {
    this.#functionDepth++;
    if (this.#functionDepth > MAX_FORMULA_FUNCTION_DEPTH) {
      this.#functionDepth--;
      throw new SearError(`Formula exceeds ${MAX_FORMULA_FUNCTION_DEPTH} nested functions`);
    }
    try {
      return { kind: FormulaNodeKind.Call, name: name.toUpperCase(), args: this.#parseCallArguments() };
    } finally {
      this.#functionDepth--;
    }
  }

  #parseCallArguments(): FormulaAST[] {
    this.#advance(); // Consume '('.

    const args: FormulaAST[] = [];

    this.#skipWhitespace();
    if (this.#peek() !== ')') {
      while (true) {
        this.#skipWhitespace();
        if (this.#peek() === ',' || this.#peek() === ')') {
          args.push({ kind: FormulaNodeKind.Missing });
        } else {
          args.push(this.#parseExpression());
        }
        this.#skipWhitespace();
        if (this.#peek() !== ',') break;
        this.#advance(); // Consume ','.
      }
    }

    this.#skipWhitespace();
    if (this.#peek() !== ')') {
      throw new SearError(`Expected ')' after function arguments at position ${this.#pos}`);
    }
    this.#advance(); // Consume ')'.

    return args;
  }

  /**
   * Parses a cell reference or range reference.
   *
   * First parses a cell reference; if it is followed by ':', parses a range reference.
   *
   * cellRef: "A1", "$A$1", "AA10"
   * rangeRef: "A1:C3", "$A$1:$C$3"
   */
  #parseCellOrRangeRef(firstPart: string): FormulaAST {
    const first = this.#parseSingleCellRef(firstPart);

    // Check whether this is a range reference: cellRef ':' cellRef.
    const afterFirst = this.#pos;
    this.#skipWhitespace();
    if (this.#peek() === ':') {
      this.#advance(); // Consume ':'.

      // Parse the second cell reference.
      let secondName = '';
      while (this.#pos < this.#input.length && /[A-Za-z0-9_$]/.test(this.#input[this.#pos])) {
        secondName += this.#input[this.#pos];
        this.#pos++;
      }
      const second = this.#parseSingleCellRef(secondName);

      return {
        kind: FormulaNodeKind.Range,
        ...normalizedCellRange(first, second),
      };
    }

    // Ordinary cell reference.
    this.#pos = afterFirst;
    return {
      kind: FormulaNodeKind.Cell,
      row: first.row,
      col: first.col,
      absRow: first.absRow,
      absCol: first.absCol,
    };
  }

  /**
   * Parses a workbook-qualified cell or range after the sheet-name bang.
   *
   * The sheet name stays as display text here; workbook hosts bind it to a
   * stable sheet id at compile/evaluation time.
   */
  #parseWorkbookCellOrRangeRef(sheetName: string): FormulaAST {
    const first = this.#parseSingleCellRef(this.#readCellReferenceText());

    const afterFirst = this.#pos;
    this.#skipWhitespace();
    if (this.#peek() === ':') {
      this.#advance();
      const second = this.#parseSingleCellRef(this.#readCellReferenceText());
      return {
        kind: FormulaNodeKind.WorkbookRange,
        sheetName,
        ...normalizedCellRange(first, second),
      };
    }

    this.#pos = afterFirst;
    return {
      kind: FormulaNodeKind.WorkbookCell,
      sheetName,
      row: first.row,
      col: first.col,
      absRow: first.absRow,
      absCol: first.absCol,
    };
  }

  #parseQuotedSheetName(): string {
    this.#advance(); // Consume opening single quote.
    let sheetName = '';
    while (this.#pos < this.#input.length) {
      const ch = this.#input[this.#pos];
      if (ch !== "'") {
        sheetName += ch;
        this.#pos++;
        continue;
      }
      if (this.#input[this.#pos + 1] === "'") {
        sheetName += "'";
        this.#pos += 2;
        continue;
      }
      this.#advance(); // Consume closing single quote.
      if (!sheetName) throw new SearError('Empty quoted sheet name');
      return sheetName;
    }
    throw new SearError('Unterminated quoted sheet name');
  }

  #readCellReferenceText(): string {
    this.#skipWhitespace();
    let ref = '';
    while (this.#pos < this.#input.length && /[A-Za-z0-9_$]/.test(this.#input[this.#pos])) {
      ref += this.#input[this.#pos];
      this.#pos++;
    }
    if (!ref) throw new SearError(`Expected cell reference at position ${this.#pos}`);
    return ref;
  }

  /**
   * Parses a single cell-reference string.
   *
   * Delegates to CellRef.parseCellRef.
   */
  #parseSingleCellRef(ref: string): ParsedCellRef {
    return parseCellRef(ref);
  }

  #parseSingleColumnRef(ref: string): { col: number; absCol: boolean } {
    if (!this.#isColumnRef(ref)) throw new SearError(`Invalid column reference: ${ref}`);
    const absCol = ref.startsWith('$');
    const label = absCol ? ref.slice(1) : ref;
    return { col: columnLabelToIndex(label), absCol };
  }

  #isColumnRef(ref: string): boolean {
    return /^\$?[A-Za-z]{1,3}$/.test(ref);
  }

  #readRowRef(): { row: number; absRow: boolean } | null {
    const start = this.#pos;
    let absRow = false;
    if (this.#peek() === '$') {
      absRow = true;
      this.#advance();
    }

    let rowText = '';
    while (this.#pos < this.#input.length && /[0-9]/.test(this.#input[this.#pos])) {
      rowText += this.#input[this.#pos];
      this.#pos++;
    }
    if (!rowText) {
      this.#pos = start;
      return null;
    }
    return { row: Number.parseInt(rowText, 10) - 1, absRow };
  }

  // ─── Dependency Extraction ───────────────────────────────

  /**
   * Recursively traverses the AST and collects every cell and range node.
   */
  #collectDeps(ast: FormulaAST, deps: Dependency[]): void {
    switch (ast.kind) {
      case FormulaNodeKind.Cell:
        deps.push({ kind: FormulaNodeKind.Cell, row: ast.row, col: ast.col });
        break;
      case FormulaNodeKind.Range:
        deps.push({
          kind: FormulaNodeKind.Range,
          start: ast.start,
          end: ast.end,
        });
        break;
      case FormulaNodeKind.WorkbookCell:
        deps.push({
          kind: FormulaNodeKind.WorkbookCell,
          sheetName: ast.sheetName,
          row: ast.row,
          col: ast.col,
        });
        break;
      case FormulaNodeKind.Spill:
        this.#collectDeps(ast.reference, deps);
        break;
      case FormulaNodeKind.WorkbookRange:
        deps.push({
          kind: FormulaNodeKind.WorkbookRange,
          sheetName: ast.sheetName,
          start: ast.start,
          end: ast.end,
        });
        break;
      case FormulaNodeKind.ColumnRange:
        deps.push({
          kind: FormulaNodeKind.ColumnRange,
          startCol: ast.startCol,
          endCol: ast.endCol,
        });
        break;
      case FormulaNodeKind.RowRange:
        deps.push({
          kind: FormulaNodeKind.RowRange,
          startRow: ast.startRow,
          endRow: ast.endRow,
        });
        break;
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        this.#collectDeps(ast.left, deps);
        this.#collectDeps(ast.right, deps);
        break;
      case FormulaNodeKind.Unary:
        this.#collectDeps(ast.operand, deps);
        break;
      case FormulaNodeKind.Tuple:
        ast.items.forEach((item) => this.#collectDeps(item, deps));
        break;
      case FormulaNodeKind.Call:
        if (ast.name.toUpperCase() === 'INDIRECT' && ast.args[0]?.kind === FormulaNodeKind.String &&
          (ast.args[1] === undefined || ast.args[1].kind === FormulaNodeKind.Boolean && ast.args[1].value)) {
          try {
            const reference = this.parse(`=${ast.args[0].value}`);
            if (reference.kind === FormulaNodeKind.Cell || reference.kind === FormulaNodeKind.Range) {
              this.#collectDeps(reference, deps);
            }
          } catch {
            // Dynamic or invalid text references are resolved during evaluation.
          }
        }
        for (const arg of ast.args) {
          this.#collectDeps(arg, deps);
        }
        break;
      case FormulaNodeKind.Invoke:
        this.#collectDeps(ast.callee, deps);
        for (const arg of ast.args) {
          this.#collectDeps(arg, deps);
        }
        break;
      case FormulaNodeKind.Array:
        for (const row of ast.rows) {
          for (const item of row) this.#collectDeps(item, deps);
        }
        break;
      case FormulaNodeKind.Name:
        break;
      // number, string, boolean, and missing nodes have no dependencies.
    }
  }

  // ─── Reference Shifting ──────────────────────────────────

  /**
   * Recursively shifts row/column references for all cell/range nodes in the AST.
   *
   * For each structural change type from MatrixOTActionName:
   * - RowInsert(index, count): row >= index -> row += count.
   * - RowDelete(index, count): row >= index + count -> row -= count;
   *   index <= row < index + count -> #REF!.
   * - ColInsert / ColDelete: same behavior for col.
   * - RowMove / ColMove: source and destination coordinates are exchanged.
   *
   * Absolute references (absRow / absCol) do not shift for insert/delete.
   * Absolute references remain fixed for every structure change kind.
   */
  #shiftNode(ast: FormulaAST, changes: StructureChange[]): FormulaAST {
    switch (ast.kind) {
      case FormulaNodeKind.Cell: {
        let newRow = ast.row;
        let newCol = ast.col;

        for (const change of changes) {
          const row = shiftStructureCoordinate({
            coordinate: newRow,
            axis: StructureChangeAxis.Row,
            changes: [change],
            absolute: ast.absRow,
          });
          const col = shiftStructureCoordinate({
            coordinate: newCol,
            axis: StructureChangeAxis.Col,
            changes: [change],
            absolute: ast.absCol,
          });
          if (row.deleted || col.deleted) return createDeletedCellReference();
          newRow = row.value;
          newCol = col.value;
        }

        // If nothing changed, return the original AST.
        if (newRow === ast.row && newCol === ast.col) return ast;
        return { ...ast, row: newRow, col: newCol };
      }

      case FormulaNodeKind.Range: {
        let [startRow, startCol] = ast.start;
        let [endRow, endCol] = ast.end;
        let refError = false;

        for (const change of changes) {
          const axis = getStructureChangeAxis(change);
          if (axis === StructureChangeAxis.Row) {
            const start = this.#shiftRangeCoordinate(startRow, ast.absStartRow, change, axis);
            const end = this.#shiftRangeCoordinate(endRow, ast.absEndRow, change, axis);
            startRow = start.value;
            endRow = end.value;
            refError ||= start.refError || end.refError;
          } else if (axis === StructureChangeAxis.Col) {
            const start = this.#shiftRangeCoordinate(startCol, ast.absStartCol, change, axis);
            const end = this.#shiftRangeCoordinate(endCol, ast.absEndCol, change, axis);
            startCol = start.value;
            endCol = end.value;
            refError ||= start.refError || end.refError;
          }
        }

        if (refError) {
          return {
            kind: FormulaNodeKind.Range,
            start: [-1, -1],
            end: [-1, -1],
            absStartRow: false,
            absStartCol: false,
            absEndRow: false,
            absEndCol: false,
          };
        }
        if (startRow === ast.start[0] && startCol === ast.start[1] && endRow === ast.end[0] && endCol === ast.end[1])
          return ast;
        return {
          ...ast,
          start: [Math.min(startRow, endRow), Math.min(startCol, endCol)],
          end: [Math.max(startRow, endRow), Math.max(startCol, endCol)],
        };
      }

      case FormulaNodeKind.ColumnRange:
      case FormulaNodeKind.RowRange:
      case FormulaNodeKind.WorkbookCell:
      case FormulaNodeKind.WorkbookRange:
        return ast;

      case FormulaNodeKind.Spill: {
        const reference = this.#shiftNode(ast.reference, changes);
        if (reference.kind !== FormulaNodeKind.Cell && reference.kind !== FormulaNodeKind.WorkbookCell) return reference;
        return reference === ast.reference ? ast : { ...ast, reference };
      }

      case FormulaNodeKind.Binary: {
        const left = this.#shiftNode(ast.left, changes);
        const right = this.#shiftNode(ast.right, changes);
        if (left === ast.left && right === ast.right) return ast;
        return { ...ast, left, right };
      }
      case FormulaNodeKind.Intersection: {
        const left = this.#shiftNode(ast.left, changes);
        const right = this.#shiftNode(ast.right, changes);
        return left === ast.left && right === ast.right ? ast : { ...ast, left, right };
      }

      case FormulaNodeKind.Unary: {
        const operand = this.#shiftNode(ast.operand, changes);
        if (operand === ast.operand) return ast;
        return { ...ast, operand };
      }
      case FormulaNodeKind.Tuple: {
        let changed = false;
        const items = ast.items.map((item) => {
          const shifted = this.#shiftNode(item, changes);
          changed ||= shifted !== item;
          return shifted;
        });
        return changed ? { ...ast, items } : ast;
      }

      case FormulaNodeKind.Call: {
        let anyChanged = false;
        const args = ast.args.map((arg) => {
          const shifted = this.#shiftNode(arg, changes);
          if (shifted !== arg) anyChanged = true;
          return shifted;
        });
        if (!anyChanged) return ast;
        return { ...ast, args };
      }

      case FormulaNodeKind.Invoke: {
        const callee = this.#shiftNode(ast.callee, changes);
        let anyChanged = callee !== ast.callee;
        const args = ast.args.map((arg) => {
          const shifted = this.#shiftNode(arg, changes);
          if (shifted !== arg) anyChanged = true;
          return shifted;
        });
        return anyChanged ? { ...ast, callee, args } : ast;
      }

      case FormulaNodeKind.Array: {
        let changed = false;
        const rows = ast.rows.map((row) =>
          row.map((item) => {
            const shifted = this.#shiftNode(item, changes);
            if (shifted !== item) changed = true;
            return shifted;
          }),
        );
        return changed ? { ...ast, rows } : ast;
      }
      case FormulaNodeKind.Name:
        return ast;

      // number, string, and boolean nodes are unaffected.
      default:
        return ast;
    }
  }

  /** Shifts one range endpoint while preserving its own absolute-reference flag. */
  #shiftRangeCoordinate(
    value: number,
    isAbsolute: boolean,
    change: StructureChange,
    axis: StructureChangeAxis,
  ): { value: number; refError: boolean } {
    const shifted = shiftStructureCoordinate({ coordinate: value, axis, changes: [change], absolute: isAbsolute });
    return { value: shifted.value, refError: shifted.deleted };
  }

  // ─── Low-Level Character Operations ─────────────────────

  /** Gets the current character without advancing. */
  #peek(): string | undefined {
    return this.#input[this.#pos];
  }

  /** Advances by one character. */
  #advance(): void {
    this.#pos++;
  }

  /** Skips whitespace characters. */
  #skipWhitespace(): void {
    while (this.#pos < this.#input.length && /\s/.test(this.#input[this.#pos])) {
      this.#pos++;
    }
  }
}

function createDeletedCellReference(): FormulaAST {
  return {
    kind: FormulaNodeKind.Cell,
    row: -1,
    col: -1,
    absRow: false,
    absCol: false,
  };
}

function normalizedCellRange(first: ParsedCellRef, second: ParsedCellRef): {
  start: [number, number]; end: [number, number];
  absStartRow: boolean; absStartCol: boolean; absEndRow: boolean; absEndCol: boolean;
} {
  const reverseRows = first.row > second.row;
  const reverseCols = first.col > second.col;
  return {
    start: [Math.min(first.row, second.row), Math.min(first.col, second.col)],
    end: [Math.max(first.row, second.row), Math.max(first.col, second.col)],
    absStartRow: reverseRows ? second.absRow : first.absRow,
    absEndRow: reverseRows ? first.absRow : second.absRow,
    absStartCol: reverseCols ? second.absCol : first.absCol,
    absEndCol: reverseCols ? first.absCol : second.absCol,
  };
}

function isReferenceExpression(ast: FormulaAST): boolean {
  return ast.kind === FormulaNodeKind.Cell || ast.kind === FormulaNodeKind.Range ||
    ast.kind === FormulaNodeKind.WorkbookCell || ast.kind === FormulaNodeKind.WorkbookRange ||
    ast.kind === FormulaNodeKind.ColumnRange || ast.kind === FormulaNodeKind.RowRange ||
    ast.kind === FormulaNodeKind.Intersection;
}

function isReferenceStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_$'0-9]/.test(ch);
}
