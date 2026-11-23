/** Stable discriminants used by formula AST nodes. */
export const FormulaNodeKind = {
  Number: 'number',
  String: 'string',
  Boolean: 'boolean',
  Error: 'error',
  Name: 'name',
  Tuple: 'tuple',
  Intersection: 'intersection',
  Cell: 'cell',
  Range: 'range',
  WorkbookCell: 'workbookCell',
  Spill: 'spill',
  WorkbookRange: 'workbookRange',
  ColumnRange: 'columnRange',
  RowRange: 'rowRange',
  Array: 'array',
  Missing: 'missing',
  Call: 'call',
  Invoke: 'invoke',
  Binary: 'binary',
  Unary: 'unary',
} as const;

/** Type contract carried by the canonical FormulaNodeKind value. */
export type FormulaNodeKind = (typeof FormulaNodeKind)[keyof typeof FormulaNodeKind];
