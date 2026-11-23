/**
 * Formula parser interface.
 *
 * Parses formula strings into abstract syntax trees (ASTs), and provides
 * dependency extraction plus reference shifting.
 *
 * Default implementation: FormulaParser (sear-formula-engine-ts)
 * Replaceable implementation: WasmFormulaParser (future sear-formula-engine-wasm)
 */

import { type FormulaAST } from './FormulaAST';
import { type StructureChange } from './StructureChange';
import { type Dependency } from './Dependency';

/**
 * Dependency item.
 *
 * Extracted from ASTs while preserving range semantics instead of expanding
 * per cell. For example, SUM(A1:C100) produces one range dependency rather
 * than 300 cell dependencies.
 *
 * This is the core V5 optimization: avoid creating millions of edges for
 * million-cell ranges.
 */
/**
 * Host-neutral contract for turning formula text into a reusable syntax tree.
 *
 * Parsing identifies operators and references but does not calculate cell
 * values. The same tree can be inspected for dependencies or rewritten after
 * rows and columns move. Formula evaluation is a separate contract.
 */
export interface IFormulaParser {
  /**
   * Parses a formula string into an AST.
   *
   * Input is a formula string with a leading '=', such as "=A1+B1".
   * Uses recursive-descent parsing and supports the full operator precedence.
   *
   * @param formula Formula string including the leading '='.
   * @returns Parsed AST.
   * @throws When parsing fails because syntax is invalid.
   */
  parse(formula: string): FormulaAST;

  /**
   * Extracts all dependencies from an AST.
   *
   * Traverses all cell and range nodes in the AST and returns a Dependency
   * list. Returned dependencies stay range-level and are not expanded per cell.
   *
   * @example
   * // =SUM(A1:C100) + D5
   * extractDependencies(ast) → [
   *   { kind: FormulaNodeKind.Range, start: [0,0], end: [99,2] },
   *   { kind: FormulaNodeKind.Cell, row: 4, col: 3 }
   * ]
   */
  extractDependencies(ast: FormulaAST): Dependency[];

  /**
   * Shifts references.
   *
   * Rewrites row/column references inside an AST after structural changes such
   * as row/column insertions and deletions. Uses immutable updates: creates a
   * new AST and never mutates the original AST.
   *
   * Rules:
   * - Absolute references ($A$1) are unaffected.
   * - Relative references shift according to insertion/deletion position.
   * - Deleted referenced rows/columns produce an AST carrying #REF!.
   *
   * @example
   * A formula =B3 in A2, after inserting one row below row 1, becomes =B4.
   * A formula =SUM(A1:A3) in A4, after deleting row 2, becomes =SUM(A1:#REF!).
   */
  shiftReferences(ast: FormulaAST, changes: StructureChange[]): FormulaAST;
}

export namespace IFormulaParser {
  export const symbol = Symbol.for('IFormulaParser');
}
