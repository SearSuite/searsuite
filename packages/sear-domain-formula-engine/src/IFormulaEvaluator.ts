/**
 * Formula evaluator interface.
 *
 * Evaluates parsed ASTs into FormulaValue results. Supports both single-formula
 * and batch evaluation; batch evaluation can substantially reduce FFI boundary
 * crossings for WASM implementations.
 *
 * Default implementation: FormulaEvaluator (sear-formula-engine-ts)
 * Replaceable implementation: WasmFormulaEvaluator (future sear-formula-engine-wasm)
 */

import { type CellKey } from './CellKey';
import { type EvalContext } from './EvalContext';
import { type EvalResult } from './EvalResult';
import { type FormulaAST } from './FormulaAST';
import { type FormulaFunction } from './FormulaFunction';
import { type FormulaValue } from './FormulaValue';

/** Public contract for IFormulaEvaluator. */
export interface IFormulaEvaluator {
  /**
   * Evaluates one AST.
   *
   * Recursively traverses the AST, performs operations, and handles error propagation:
   * - Any FormulaError operand -> result is that error.
   * - Division by zero -> #DIV/0!.
   * - Type mismatch -> #VALUE!.
   * - Unknown function name -> #NAME?.
   *
   * @param ast Parsed formula AST.
   * @param context Evaluation context that provides cell-value reads.
   * @returns Calculated result.
   */
  evaluate(ast: FormulaAST, context: EvalContext): FormulaValue;

  /**
   * Batch evaluation.
   *
   * The TS implementation can call evaluate one by one. A WASM implementation
   * can process all ASTs on the Rust side in one pass, avoiding 100K JS <-> WASM
   * boundary crossings.
   *
   * @param asts AST list to evaluate; each item contains a CellKey and its AST.
   * @param context Evaluation context.
   * @returns Evaluation result list.
   */
  evaluateBatch(asts: Array<{ key: CellKey; ast: FormulaAST }>, context: EvalContext): EvalResult[];

  /**
   * Registers a custom function.
   *
   * After registration, formulas can call the function by name. For example,
   * registering AVERAGE allows =AVERAGE(A1:A10).
   */
  registerFunction(fn: FormulaFunction): void;
}

export namespace IFormulaEvaluator {
  export const symbol = Symbol.for('IFormulaEvaluator');
}
