/**
 * Formula evaluator: TS implementation of IFormulaEvaluator.
 *
 * Recursively traverses ASTs, executes operations, and handles error propagation.
 * IFunctionRegistry and IAggregationCache are injected through DI.
 *
 * Error propagation rules:
 * - Any FormulaError operand -> result is that error.
 * - Division by zero -> #DIV/0!.
 * - Type mismatch -> #VALUE!.
 * - Unknown function name -> #NAME?.
 * - Out-of-bounds cell -> #REF!.
 */

import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import {
  type FormulaAST,
  type FormulaValue,
  type FormulaError,
  type EvalContext,
  type EvalResult,
  type CellKey,
  type FormulaFunction,
  type FormulaArg,
  type FormulaRichResult,
  FormulaErrorCode,
  createFormulaError,
  FormulaNodeKind,
  IFormulaEvaluator,
  IFunctionRegistry,
  IAggregationCache,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { fromCellKey } from './fromCellKey';
import { FormulaExecutionBudget } from './FormulaExecutionBudget';
import { excelPower } from './excelPower';
import { resolveReferenceIntersection } from './FormulaReferenceIntersection';
import { numericDateText } from './functions/shared/formulaNumericDateText';

const COMPARISON_OPERATORS = new Set(['=', '<>', '<', '>', '<=', '>=']);

/** Evaluates parsed formulas against an explicit host-provided context. */
@Injectable()
export class FormulaEvaluator implements IFormulaEvaluator {
  #registry: IFunctionRegistry;
  #aggCache: IAggregationCache;

  /** DI token for resolving FormulaEvaluator. */
  public static readonly symbol = Symbol.for('FormulaEvaluator');

  /** Creates a FormulaEvaluator instance. */
  constructor(
    @Inject(IFunctionRegistry.symbol) registry: IFunctionRegistry,
    @Inject(IAggregationCache.symbol) aggCache: IAggregationCache,
  ) {
    this.#registry = registry;
    this.#aggCache = aggCache;
  }

  /**
   * Evaluates one AST.
   *
   * Recursively traverses each AST node and executes the matching operation.
   */
  evaluate(ast: FormulaAST, context: EvalContext): FormulaValue {
    if (!context.budget) return this.evaluate(ast, { ...context, budget: new FormulaExecutionBudget() });
    if (context.budget && !context.budget.consumeStep()) return createFormulaError(FormulaErrorCode.Number);
    switch (ast.kind) {
      // ─── Literal Nodes: Return Values Directly ───
      case FormulaNodeKind.Number:
        return ast.value;
      case FormulaNodeKind.String:
        return ast.value;
      case FormulaNodeKind.Boolean:
        return ast.value;
      case FormulaNodeKind.Error:
        return createFormulaError(ast.code);
      case FormulaNodeKind.Name:
        return context.scope?.get(ast.name) ?? createFormulaError(FormulaErrorCode.Name);
      case FormulaNodeKind.Tuple:
        return { kind: 'tuple', items: ast.items.map((item) => this.#evaluateArrayExpression(item, context)) };

      case FormulaNodeKind.Intersection: {
        const reference = resolveReferenceIntersection(ast, context);
        if (isFormulaError(reference)) return reference;
        return reference.kind === FormulaNodeKind.Cell
          ? this.#evaluateCell(reference.row, reference.col, context)
          : reference.kind === FormulaNodeKind.WorkbookCell
          ? this.#evaluateWorkbookCell(reference.sheetName, reference.row, reference.col, context)
          : createFormulaError(FormulaErrorCode.Value);
      }

      case FormulaNodeKind.Array:
        return ast.rows.map((row) => row.map((item) => this.#evaluateArrayExpression(item, context)));

      case FormulaNodeKind.Missing:
        return createFormulaError(FormulaErrorCode.Value);

      // ─── Cell Reference: Read From Context ───
      case FormulaNodeKind.Cell:
        return this.#evaluateCell(ast.row, ast.col, context);

      case FormulaNodeKind.WorkbookCell:
        return this.#evaluateWorkbookCell(ast.sheetName, ast.row, ast.col, context);

      case FormulaNodeKind.Spill:
        return this.#evaluateSpill(ast.reference, context);

      // ─── Range Reference: Cannot Be Evaluated Directly ───
      case FormulaNodeKind.Range:
      case FormulaNodeKind.WorkbookRange:
        // Range references are invalid in direct-value positions, such as
        // =A1:A3 without a wrapping function. They are valid only as function
        // arguments, where evaluateCall handles them.
        return createFormulaError(FormulaErrorCode.Value);

      case FormulaNodeKind.ColumnRange:
      case FormulaNodeKind.RowRange:
        return createFormulaError(FormulaErrorCode.Value);

      // ─── Binary Operation ───
      case FormulaNodeKind.Binary:
        return this.#evaluateBinary(ast.op, ast.left, ast.right, context);

      // ─── Unary Operation ───
      case FormulaNodeKind.Unary:
        return this.#evaluateUnary(ast.op, ast.operand, context);

      // ─── Function Call ───
      case FormulaNodeKind.Call:
        return this.#evaluateCall(ast.name, ast.args, context);
      case FormulaNodeKind.Invoke: {
        const callee = this.evaluate(ast.callee, context);
        return isFormulaError(callee) ? callee : createFormulaError(FormulaErrorCode.Value);
      }
    }
  }

  /**
   * Batch evaluation.
   *
   * The TS implementation evaluates one AST at a time. A WASM implementation
   * can process all ASTs on the Rust side in one pass.
   */
  evaluateBatch(asts: Array<{ key: CellKey; ast: FormulaAST }>, context: EvalContext): EvalResult[] {
    return asts.map(({ key, ast }) => {
      const [row, col] = fromCellKey(key);
      const scopedContext = context.forFormulaCell?.({ row, col }) ?? { ...context, currentCell: { row, col } };
      let richResult: FormulaRichResult | undefined;
      const rootContext = {
        ...scopedContext,
        rootFormulaCall: ast.kind === FormulaNodeKind.Call,
        ...(ast.kind === FormulaNodeKind.Call && ast.name.toUpperCase() === 'HYPERLINK'
          ? { publishRichResult: (result: FormulaRichResult | undefined) => { richResult = result; } }
          : {}),
      };
      const value = this.evaluate(ast, rootContext);
      return richResult && !isFormulaError(value) ? { key, value, richResult } : { key, value };
    });
  }

  /**
   * Registers a custom function.
   */
  registerFunction(fn: FormulaFunction): void {
    this.#registry.register(fn);
  }

  // ─── Internal Evaluation Methods ────────────────────────

  /**
   * Evaluates a cell reference.
   */
  #evaluateCell(row: number, col: number, context: EvalContext): FormulaValue {
    // Negative values come from reference shifting; positive coordinates beyond
    // current sheet bounds are also #REF!.
    if (!context.isCellInBounds(row, col)) {
      return createFormulaError(FormulaErrorCode.Reference);
    }
    try {
      return context.getCellValue(row, col);
    } catch {
      return createFormulaError(FormulaErrorCode.Reference);
    }
  }

  #evaluateWorkbookCell(sheetName: string, row: number, col: number, context: EvalContext): FormulaValue {
    if (!context.getWorkbookCellValue) return createFormulaError(FormulaErrorCode.Reference);
    try {
      return context.getWorkbookCellValue(sheetName, row, col);
    } catch {
      return createFormulaError(FormulaErrorCode.Reference);
    }
  }

  #evaluateSpill(
    reference: Extract<FormulaAST, { kind: typeof FormulaNodeKind.Cell | typeof FormulaNodeKind.WorkbookCell }>,
    context: EvalContext,
  ): FormulaValue {
    const { row, col } = reference;
    const sheetName = reference.kind === FormulaNodeKind.WorkbookCell ? reference.sheetName : undefined;
    if (sheetName === undefined && !context.isCellInBounds(row, col)) {
      return createFormulaError(FormulaErrorCode.Reference);
    }
    const value = context.getSpillValue?.(row, col, sheetName);
    return Array.isArray(value) ? value : createFormulaError(FormulaErrorCode.Reference);
  }

  /**
   * Evaluates a binary operation.
   *
   * Steps:
   * 1. Evaluate left and right operands first.
   * 2. Propagate errors: if either operand is FormulaError, return that error.
   * 3. Execute the operation.
   */
  #evaluateBinary(op: string, leftAST: FormulaAST, rightAST: FormulaAST, context: EvalContext): FormulaValue {
    const left = this.#evaluateArrayExpression(leftAST, context);
    const right = this.#evaluateArrayExpression(rightAST, context);
    const chainedComparison = COMPARISON_OPERATORS.has(op) &&
      leftAST.kind === FormulaNodeKind.Binary && COMPARISON_OPERATORS.has(leftAST.op);

    if (Array.isArray(left) || Array.isArray(right)) {
      return this.#applyArrayBinary(op, left, right, context, chainedComparison);
    }

    return this.#applyScalarBinary(op, left, right, context, chainedComparison);
  }

  /**
   * Evaluates a unary operation.
   */
  #evaluateUnary(op: string, operandAST: FormulaAST, context: EvalContext): FormulaValue {
    const operand = this.#evaluateArrayExpression(operandAST, context);

    if (Array.isArray(operand)) {
      const rows = operand as FormulaValue[][];
      return rows.map((row) =>
        (Array.isArray(row) ? row : [row]).map((value) => this.#applyScalarUnary(op, value, context)),
      );
    }

    // Error propagation.
    if (isFormulaError(operand)) return operand;

    switch (op) {
      case '-': {
        const n = this.#numericOperand(operand, context);
        if (isFormulaError(n)) return n;
        return -n;
      }
      case '+': {
        const n = this.#numericOperand(operand, context);
        if (isFormulaError(n)) return n;
        return n;
      }
      case '%': {
        const n = this.#numericOperand(operand, context);
        if (isFormulaError(n)) return n;
        return n / 100;
      }
      case 'NOT':
        if (typeof operand === 'boolean') return !operand;
        return createFormulaError(FormulaErrorCode.Value);
      default:
        return createFormulaError(FormulaErrorCode.Value);
    }
  }

  /**
   * Evaluates a function call.
   *
   * Steps:
   * 1. Find the function definition.
   * 2. Build the FormulaArg[] list, preserving range/cell semantics without expansion.
   * 3. Call the function's evaluate method.
   */
  #evaluateCall(name: string, argsAST: FormulaAST[], context: EvalContext): FormulaValue {
    // Find the function.
    const fn = this.#registry.get(name);
    if (!fn) {
      return createFormulaError(FormulaErrorCode.Name);
    }

    // Build the argument list.
    // Preserve raw semantics for range and cell nodes instead of evaluating eagerly.
    // Evaluate other nodes (number, string, binary, etc.) before passing them in.
    const nestedContext = context.rootFormulaCall ? { ...context, rootFormulaCall: false } : context;
    const args: FormulaArg[] = argsAST.map((argAST) => {
      if (argAST.kind === FormulaNodeKind.Missing) return { kind: 'missing' };
      if (fn.lazy === true) return { kind: 'expression', ast: argAST };
      if (argAST.kind === FormulaNodeKind.Intersection) {
        const reference = resolveReferenceIntersection(argAST, nestedContext);
        return isFormulaError(reference) ? { kind: 'value', value: reference } : reference;
      }
      if (argAST.kind === FormulaNodeKind.Range) {
        if (
          !context.isCellInBounds(argAST.start[0], argAST.start[1]) ||
          !context.isCellInBounds(argAST.end[0], argAST.end[1])
        ) {
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        }
        return {
          kind: FormulaNodeKind.Range,
          start: argAST.start,
          end: argAST.end,
        };
      }
      if (argAST.kind === FormulaNodeKind.WorkbookRange) {
        if (!context.iterateWorkbookRange) {
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        }
        return {
          kind: FormulaNodeKind.WorkbookRange,
          sheetName: argAST.sheetName,
          start: argAST.start,
          end: argAST.end,
        };
      }
      if (argAST.kind === FormulaNodeKind.ColumnRange) {
        const [rowCount] = context.getSheetShape?.() ?? [0, 0];
        if (rowCount <= 0)
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        if (!context.isCellInBounds(0, argAST.startCol) || !context.isCellInBounds(rowCount - 1, argAST.endCol)) {
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        }
        return {
          kind: FormulaNodeKind.ColumnRange,
          startCol: argAST.startCol,
          endCol: argAST.endCol,
        };
      }
      if (argAST.kind === FormulaNodeKind.RowRange) {
        const [, colCount] = context.getSheetShape?.() ?? [0, 0];
        if (colCount <= 0)
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        if (!context.isCellInBounds(argAST.startRow, 0) || !context.isCellInBounds(argAST.endRow, colCount - 1)) {
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        }
        return {
          kind: FormulaNodeKind.RowRange,
          startRow: argAST.startRow,
          endRow: argAST.endRow,
        };
      }
      if (argAST.kind === FormulaNodeKind.Cell) {
        if (!fn.allowReferencesOutsideHostShape && !context.isCellInBounds(argAST.row, argAST.col)) {
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        }
        return { kind: FormulaNodeKind.Cell, row: argAST.row, col: argAST.col };
      }
      if (argAST.kind === FormulaNodeKind.WorkbookCell) {
        if (!context.getWorkbookCellValue) {
          return {
            kind: 'value',
            value: createFormulaError(FormulaErrorCode.Reference),
          };
        }
        return {
          kind: FormulaNodeKind.WorkbookCell,
          sheetName: argAST.sheetName,
          row: argAST.row,
          col: argAST.col,
        };
      }
      if (argAST.kind === FormulaNodeKind.Name) {
        const scoped = context.scope?.get(argAST.name);
        if (scoped !== undefined) return { kind: 'value', value: scoped, sourceAst: argAST };
        const value = Object.entries(fn.namedConstants ?? {}).find(
          ([name]) => name.toUpperCase() === argAST.name.toUpperCase(),
        )?.[1];
        return { kind: 'value', value: value ?? createFormulaError(FormulaErrorCode.Name), sourceAst: argAST };
      }
      // Evaluate other nodes first.
      const value = this.#evaluateArrayExpression(argAST, nestedContext);
      return { kind: 'value', value, sourceKind: argAST.kind, sourceAst: argAST };
    });

    // Call the function.
    return fn.evaluate(args, {
      ...context,
      aggregationCache: this.#aggCache,
      evaluateFormula: (ast, scope) => this.evaluate(ast, scope ? { ...nestedContext, scope } : nestedContext),
      evaluateArrayFormula: (ast, scope) => this.#evaluateArrayExpression(ast, scope ? { ...nestedContext, scope } : nestedContext),
    });
  }

  /** Evaluates an expression in array context, promoting range references to 2D values. */
  #evaluateArrayExpression(ast: FormulaAST, context: EvalContext): FormulaValue {
    switch (ast.kind) {
      case FormulaNodeKind.Intersection: {
        const reference = resolveReferenceIntersection(ast, context);
        if (isFormulaError(reference)) return reference;
        if (reference.kind === FormulaNodeKind.Cell) return this.#evaluateCell(reference.row, reference.col, context);
        if (reference.kind === FormulaNodeKind.WorkbookCell) {
          return this.#evaluateWorkbookCell(reference.sheetName, reference.row, reference.col, context);
        }
        if (reference.kind === FormulaNodeKind.Range) {
          return this.#evaluateArrayExpression(
            {
              kind: FormulaNodeKind.Range,
              start: reference.start,
              end: reference.end,
              absStartRow: false,
              absStartCol: false,
              absEndRow: false,
              absEndCol: false,
            },
            context,
          );
        }
        return this.#evaluateArrayExpression(
          {
            kind: FormulaNodeKind.WorkbookRange,
            sheetName: reference.sheetName,
            start: reference.start,
            end: reference.end,
            absStartRow: false,
            absStartCol: false,
            absEndRow: false,
            absEndCol: false,
          },
          context,
        );
      }
      case FormulaNodeKind.Range: {
        if (!context.isCellInBounds(ast.start[0], ast.start[1]) || !context.isCellInBounds(ast.end[0], ast.end[1])) {
          return createFormulaError(FormulaErrorCode.Reference);
        }
        const rows: FormulaValue[][] = [];
        const values = context.iterateRange(ast.start[0], ast.start[1], ast.end[0], ast.end[1]);
        const width = ast.end[1] - ast.start[1] + 1;
        let row: FormulaValue[] = [];
        for (const value of values) {
          row.push(value);
          if (row.length === width) {
            rows.push(row);
            row = [];
          }
        }
        if (row.length > 0) rows.push(row);
        return rows;
      }
      case FormulaNodeKind.WorkbookRange: {
        if (!context.iterateWorkbookRange) return createFormulaError(FormulaErrorCode.Reference);
        const rows: FormulaValue[][] = [];
        const values = context.iterateWorkbookRange(ast.sheetName, ast.start[0], ast.start[1], ast.end[0], ast.end[1]);
        const width = ast.end[1] - ast.start[1] + 1;
        let row: FormulaValue[] = [];
        for (const value of values) {
          row.push(value);
          if (row.length === width) {
            rows.push(row);
            row = [];
          }
        }
        if (row.length > 0) rows.push(row);
        return rows;
      }
      case FormulaNodeKind.ColumnRange:
      case FormulaNodeKind.RowRange:
        return createFormulaError(FormulaErrorCode.Value);
      case FormulaNodeKind.Array:
        return ast.rows.map((row) => row.map((item) => this.#evaluateArrayExpression(item, context)));
      case FormulaNodeKind.Binary:
        return this.#evaluateBinary(ast.op, ast.left, ast.right, context);
      case FormulaNodeKind.Unary:
        return this.#evaluateUnary(ast.op, ast.operand, context);
      case FormulaNodeKind.Call:
        return this.#evaluateCall(ast.name, ast.args, context);
      case FormulaNodeKind.Invoke: {
        const callee = this.evaluate(ast.callee, context);
        return isFormulaError(callee) ? callee : createFormulaError(FormulaErrorCode.Value);
      }
      case FormulaNodeKind.Cell:
      case FormulaNodeKind.WorkbookCell:
      case FormulaNodeKind.Spill:
      case FormulaNodeKind.Number:
      case FormulaNodeKind.String:
      case FormulaNodeKind.Boolean:
      case FormulaNodeKind.Error:
      case FormulaNodeKind.Name:
      case FormulaNodeKind.Tuple:
        return this.evaluate(ast, context);
      case FormulaNodeKind.Missing:
        return createFormulaError(FormulaErrorCode.Value);
    }
  }

  #applyArrayBinary(
    op: string, left: FormulaValue, right: FormulaValue, context: EvalContext, chainedComparison = false,
  ): FormulaValue {
    const leftRows = Array.isArray(left) ? (left as FormulaValue[][]) : undefined;
    const rightRows = Array.isArray(right) ? (right as FormulaValue[][]) : undefined;
    const rowCount = leftRows?.length ?? rightRows?.length ?? 1;
    const colCount = leftRows
      ? Math.max(...leftRows.map((r) => (Array.isArray(r) ? r.length : 1)), 0)
      : rightRows
      ? Math.max(...rightRows.map((r) => (Array.isArray(r) ? r.length : 1)), 0)
      : 1;
    if (rowCount === 0 || colCount === 0) return createFormulaError(FormulaErrorCode.Value);
    const out: FormulaValue[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const row: FormulaValue[] = [];
      for (let c = 0; c < colCount; c++) {
        const lv = leftRows
          ? Array.isArray(leftRows[r])
            ? leftRows[r][c]
            : c === 0
            ? leftRows[r]
            : createFormulaError(FormulaErrorCode.Value)
          : left;
        const rv = rightRows
          ? Array.isArray(rightRows[r])
            ? rightRows[r][c]
            : c === 0
            ? rightRows[r]
            : createFormulaError(FormulaErrorCode.Value)
          : right;
        row.push(this.#applyScalarBinary(op, lv, rv, context, chainedComparison));
      }
      out.push(row);
    }
    return out;
  }

  #applyScalarBinary(
    op: string, left: FormulaValue, right: FormulaValue, context: EvalContext, chainedComparison = false,
  ): FormulaValue {
    if (isFormulaError(left)) return left;
    if (isFormulaError(right)) return right;
    if (chainedComparison && typeof left === 'boolean') left = Number(left);
    switch (op) {
      case '+': {
        const l = this.#numericOperand(left, context);
        const r = this.#numericOperand(right, context);
        return isFormulaError(l) ? l : isFormulaError(r) ? r : this.#finiteArithmeticResult(l + r);
      }
      case '-': {
        const l = this.#numericOperand(left, context);
        const r = this.#numericOperand(right, context);
        return isFormulaError(l) ? l : isFormulaError(r) ? r : this.#finiteArithmeticResult(l - r);
      }
      case '*': {
        const l = this.#numericOperand(left, context);
        const r = this.#numericOperand(right, context);
        return isFormulaError(l) ? l : isFormulaError(r) ? r : this.#finiteArithmeticResult(l * r);
      }
      case '/': {
        const l = this.#numericOperand(left, context);
        const r = this.#numericOperand(right, context);
        if (isFormulaError(l)) return l;
        if (isFormulaError(r)) return r;
        return r === 0 ? createFormulaError(FormulaErrorCode.DivisionByZero) : this.#finiteArithmeticResult(l / r);
      }
      case '^': {
        const l = this.#numericOperand(left, context);
        const r = this.#numericOperand(right, context);
        return isFormulaError(l) ? l : isFormulaError(r) ? r : excelPower(l, r);
      }
      case '&': {
        const joined = String(this.#toDisplayString(left)) + String(this.#toDisplayString(right));
        return joined.length > 32767 ? createFormulaError(FormulaErrorCode.Value) : joined;
      }
      case '=':
        return this.#compareValues(left, right) === 0;
      case '<>':
        return this.#compareValues(left, right) !== 0;
      case '<':
        return this.#compareValues(left, right) < 0;
      case '>':
        return this.#compareValues(left, right) > 0;
      case '<=':
        return this.#compareValues(left, right) <= 0;
      case '>=':
        return this.#compareValues(left, right) >= 0;
      default:
        return createFormulaError(FormulaErrorCode.Value);
    }
  }

  #finiteArithmeticResult(value: number): FormulaValue {
    return Number.isFinite(value) ? value : createFormulaError(FormulaErrorCode.Number);
  }

  #applyScalarUnary(op: string, operand: FormulaValue, context: EvalContext): FormulaValue {
    if (isFormulaError(operand)) return operand;
    if (op === 'NOT') return typeof operand === 'boolean' ? !operand : createFormulaError(FormulaErrorCode.Value);
    const n = this.#numericOperand(operand, context);
    if (isFormulaError(n)) return n;
    if (op === '-') return -n;
    if (op === '%') return n / 100;
    return n;
  }

  // ─── Helpers ─────────────────────────────────────────────

  #numericOperand(value: FormulaValue, context: EvalContext): number | FormulaError {
    const number = toNumberOrError(value);
    return isFormulaError(number) ? numericDateText(value, context) ?? number : number;
  }

  /**
   * Converts a value to a display string for the & concatenation operator.
   *
   * number: String(n)
   * boolean: "TRUE" / "FALSE"
   * string: unchanged
   */
  #toDisplayString(v: FormulaValue): string {
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    if (isFormulaText(v)) return v.value;
    return '';
  }

  /**
   * Compares two values for =, <>, <, >, <=, and >= operations.
   *
   * Excel type-comparison rules:
   * - number < string < boolean
   * - Same types compare in natural order.
   * - Different types compare by number < string < boolean.
   *
   * @returns Negative when left < right, 0 when equal, positive when left > right.
   */
  #compareValues(left: FormulaValue, right: FormulaValue): number {
    const typeOrder = (v: FormulaValue): number => {
      if (typeof v === 'number') return 0;
      if (typeof v === 'string' || isFormulaText(v)) return 1;
      if (typeof v === 'boolean') return 2;
      return 3;
    };

    const lt = typeOrder(left);
    const rt = typeOrder(right);

    // Different types: compare by type order.
    if (lt !== rt) return lt - rt;

    // Same-type comparison.
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    if ((typeof left === 'string' || isFormulaText(left)) && (typeof right === 'string' || isFormulaText(right))) {
      const leftText = typeof left === 'string' ? left : left.value;
      const rightText = typeof right === 'string' ? right : right.value;
      return leftText.toLowerCase().localeCompare(rightText.toLowerCase());
    }
    if (typeof left === 'boolean' && typeof right === 'boolean') {
      return (left ? 1 : 0) - (right ? 1 : 0);
    }

    return 0;
  }
}
