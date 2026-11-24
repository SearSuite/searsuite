import { createFormulaError } from './createFormulaError';
import { type EvalContext } from './EvalContext';
import { type FormulaArg } from './FormulaArg';
import { isFormulaArgumentKind } from './FormulaArgumentKind';
import { type FormulaError } from './FormulaError';
import { FormulaErrorCode } from './FormulaErrorCode';
import { FormulaNodeKind } from './FormulaNodeKind';
import { type FormulaValue } from './FormulaValue';
import { isFormulaError } from './isFormulaError';
import { type ResolvedFormulaRange } from './ResolvedFormulaRange';

/** Public coercion and argument-reading SDK for built-in and third-party formula functions. */
export class FormulaFunctionArguments {
  readonly #args: readonly FormulaArg[];
  readonly #context: EvalContext;

  public constructor(args: readonly FormulaArg[], context: EvalContext) {
    this.#args = args;
    this.#context = context;
  }

  /** Reads one scalar argument while preserving formula errors. */
  public value(index: number): FormulaValue | FormulaError {
    const arg = this.#args[index];
    if (!arg || isFormulaArgumentKind(arg, 'missing')) return valueError();
    if (isFormulaArgumentKind(arg, 'value')) return arg.value;
    if (isFormulaArgumentKind(arg, 'expression')) return this.#context.evaluateFormula?.(arg.ast) ?? valueError();
    if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) return this.#context.getCellValue(arg.row, arg.col);
    if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)) {
      return this.#context.getWorkbookCellValue?.(arg.sheetName, arg.row, arg.col) ?? valueError();
    }
    if (isFormulaArgumentKind(arg, 'reference')) return this.#context.readReference?.(arg.reference) ?? valueError();
    return valueError();
  }

  /** Reads a reference argument without materializing it. */
  public reference(index: number): ResolvedFormulaRange | FormulaError {
    const arg = this.#args[index];
    if (!arg || isFormulaArgumentKind(arg, 'missing')) return valueError();
    if (isFormulaArgumentKind(arg, 'reference')) return arg.reference;
    if (isFormulaArgumentKind(arg, FormulaNodeKind.Range)) {
      return {
        source: { kind: 'currentSheet' },
        startRow: arg.start[0],
        startCol: arg.start[1],
        endRow: arg.end[0],
        endCol: arg.end[1],
      };
    }
    if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) {
      return {
        source: { kind: 'currentSheet' },
        startRow: arg.row,
        startCol: arg.col,
        endRow: arg.row,
        endCol: arg.col,
      };
    }
    if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange)) {
      return {
        source: { kind: 'workbookSheet', sheetName: arg.sheetName },
        startRow: arg.start[0],
        startCol: arg.start[1],
        endRow: arg.end[0],
        endCol: arg.end[1],
      };
    }
    if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)) {
      return {
        source: { kind: 'workbookSheet', sheetName: arg.sheetName },
        startRow: arg.row,
        startCol: arg.col,
        endRow: arg.row,
        endCol: arg.col,
      };
    }
    return valueError();
  }

  /** Reads and coerces one argument to text using spreadsheet-compatible scalar rules. */
  public text(index: number, fallback?: string): string | FormulaError {
    if (this.isMissing(index) && fallback !== undefined) return fallback;
    const value = this.value(index);
    if (isFormulaError(value)) return value;
    if (Array.isArray(value)) return valueError();
    if (isFormulaTextValue(value)) return value.value;
    if (typeof value === 'object') return valueError();
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  /** Reads and coerces one argument to a finite number. */
  public number(index: number, fallback?: number): number | FormulaError {
    if (this.isMissing(index) && fallback !== undefined) return fallback;
    const value = this.value(index);
    if (isFormulaError(value)) return value;
    if (Array.isArray(value)) return valueError();
    if (typeof value === 'number') return Number.isFinite(value) ? value : valueError();
    if (typeof value === 'boolean') return value ? 1 : 0;
    const text = typeof value === 'string' ? value : isFormulaTextValue(value) ? value.value : undefined;
    if (text === undefined) return valueError();
    const numeric = Number(text);
    return text.trim() === '' || !Number.isFinite(numeric) ? valueError() : numeric;
  }

  /** Reads a truncated integer argument. */
  public integer(index: number, fallback?: number): number | FormulaError {
    const value = this.number(index, fallback);
    return isFormulaError(value) ? value : Math.trunc(value);
  }

  /** Reads a boolean argument from booleans, numbers, or TRUE/FALSE text. */
  public boolean(index: number, fallback?: boolean): boolean | FormulaError {
    if (this.isMissing(index) && fallback !== undefined) return fallback;
    const value = this.value(index);
    if (isFormulaError(value)) return value;
    if (Array.isArray(value)) return valueError();
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = typeof value === 'string' ? value : isFormulaTextValue(value) ? value.value : undefined;
    if (text === undefined) return valueError();
    return /^true$/i.test(text) ? true : /^false$/i.test(text) ? false : valueError();
  }

  /** Returns whether an argument was omitted. */
  public isMissing(index: number): boolean {
    const arg = this.#args[index];
    return !arg || isFormulaArgumentKind(arg, 'missing');
  }
}

function valueError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Value);
}

function isFormulaTextValue(value: FormulaValue): value is FormulaValue & {
  readonly kind: 'text';
  readonly value: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === 'text' &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}
