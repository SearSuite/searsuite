/** Marks formula registries borrowed from a Workbook owner by a mounted Sheet. */
export interface FormulaRegistryOwnership {
  readonly functions: boolean;
  readonly textServices: boolean;
  readonly externalServices: boolean;
}

export namespace FormulaRegistryOwnership {
  export const symbol = Symbol.for('FormulaRegistryOwnership');
}
