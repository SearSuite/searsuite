/** Platform-neutral lifecycle for a Sheet formula input surface. */
export abstract class SearFormulaBar {
  public static readonly symbol: symbol = Symbol.for('SearFormulaBar');

  abstract mount(target: unknown): void;
  abstract destroy(): void;
}
