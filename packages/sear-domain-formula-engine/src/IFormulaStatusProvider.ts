import { type FormulaCellStatus } from './FormulaCellStatus';

/**
 * Read-only formula status snapshot for one sheet cell.
 *
 * Non-formula cells still report their downstream formula dependents so hosts
 * can inspect "who depends on this cell" without first knowing whether the
 * queried cell owns a formula. Formula cells additionally expose source text,
 * the latest calculated result, dependency edges, and dirty state.
 */
/**
 * Read-only provider for formula result, source, dependency, and dirty status.
 *
 * Hosts should prefer the command surface that delegates to this provider,
 * while plugins can inject the provider directly when they run inside the
 * editor lifecycle.
 */
export interface IFormulaStatusProvider {
  /**
   * Gets a stable formula status snapshot for one sheet cell.
   * @param row - Row index (0-based).
   * @param col - Column index (0-based).
   * @returns Formula status with defensive copies of dependency arrays.
   */
  getFormulaCellStatus(row: number, col: number): FormulaCellStatus;
}

export namespace IFormulaStatusProvider {
  /** DI token for resolving IFormulaStatusProvider. */
  export const symbol = Symbol.for('IFormulaStatusProvider');
}
