/** Coarse argument kinds stable across formula-engine implementations. */
export type FormulaFunctionArgumentKind =
  | 'any'
  | 'number'
  | 'text'
  | 'boolean'
  | 'cell'
  | 'range'
  | 'array'
  | 'reference'
  | 'function'
  | 'rich';
