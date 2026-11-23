/** Read-only provider for the formula source text shown while editing. */
export interface IFormulaSourceProvider {
  /**
   * Gets the formula source that should be presented to the user for one cell.
   *
   * Providers may return undefined when they do not own the queried cell. The
   * default sheet formula provider returns the persisted formula text, while
   * workbook-aware providers can return display text formatted from stable
   * workbook bindings and the current sheet names.
   */
  getFormulaSource(row: number, col: number): string | undefined;
}

export namespace IFormulaSourceProvider {
  /** DI token for resolving IFormulaSourceProvider. */
  export const symbol = Symbol.for('IFormulaSourceProvider');
}
