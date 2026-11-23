import { type FormulaValue } from './FormulaValue';
import { type CellFormat } from '@searsuite/sear-domain-cell-types';

/**
 * Read-only provider for calculated formula results.
 *
 * Rendering and other consumers use this interface to read per-client derived
 * formula values without depending on a concrete formula plugin implementation.
 */
export interface IFormulaResultProvider {
  /**
   * Gets the calculated result for a formula anchor or one of its dynamic-array spill cells.
   * @param row - Row index (0-based).
   * @param col - Column index (0-based).
   * @returns FormulaValue, or undefined when not calculated or not a formula cell.
   */
  getFormulaResult(row: number, col: number): FormulaValue | undefined;

  /** Derived format for a numeric formula result; explicit cell formatting takes precedence. */
  getFormulaResultFormat?(row: number, col: number): CellFormat | undefined;

  /**
   * Visits calculated result coordinates in an inclusive range. Providers that
   * project results into cells without persisted data must implement this so
   * range consumers can discover those cells without probing empty positions.
   */
  forEachFormulaResultInRange?(
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (row: number, column: number) => void,
  ): void;
}

export namespace IFormulaResultProvider {
  /** DI token for resolving IFormulaResultProvider. */
  export const symbol = Symbol.for('IFormulaResultProvider');
}
