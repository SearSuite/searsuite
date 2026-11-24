/**
 * Formula reference shifter.
 *
 * During row/column insertions and deletions, traverses all formula ASTs and
 * calls parser.shiftReferences() to shift row/column references.
 *
 * Examples:
 * - Formula =SUM(A1:A3) in A4, after inserting one row above row 2,
 *   becomes =SUM(A1:A4) by automatic reference shifting.
 * - Deleting a referenced row makes the formula become #REF!.
 */

import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import {
  type CellKey,
  type FormulaAST,
  type StructureChange,
  IFormulaParser,
} from '@searsuite/sear-domain-formula-engine';

/** Rewrites formula references after Sheet structure changes. */
@Injectable()
export class FormulaRefShifter {
  #parser: IFormulaParser;

  /** DI token for resolving FormulaRefShifter. */
  public static readonly symbol = Symbol.for('FormulaRefShifter');

  /** Creates a FormulaRefShifter instance. */
  constructor(@Inject(IFormulaParser.symbol) parser: IFormulaParser) {
    this.#parser = parser;
  }

  /**
   * Handles structural changes by traversing all formula ASTs and shifting references.
   *
   * @param formulas Current AST cache for all formulas (CellKey -> AST).
   * @param changes Structural change list for row/column insertion and deletion.
   * @returns Formula list that needs updates (key -> new AST).
   */
  shiftAll(
    formulas: Map<CellKey, FormulaAST>,
    changes: StructureChange[],
  ): Array<{ key: CellKey; newAst: FormulaAST }> {
    const result: Array<{ key: CellKey; newAst: FormulaAST }> = [];

    for (const [key, ast] of formulas) {
      // Call the parser's reference-shifting method.
      // shiftReferences returns a new immutable AST, or the original AST when nothing changed.
      const newAst = this.#parser.shiftReferences(ast, changes);
      if (newAst !== ast) {
        result.push({ key, newAst });
      }
    }

    return result;
  }
}
