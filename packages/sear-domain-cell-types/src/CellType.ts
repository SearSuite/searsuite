/**
 * Built-in persisted cell type identifiers.
 *
 * Consumers may use arbitrary strings for their own types; these constants
 * keep the built-in values consistent across editing, rendering and formulas.
 */
export const CellType = {
  Empty: 'empty',
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Formula: 'formula',
  RichText: 'richtext',
} as const;

/** Type contract for CellType. */
export type CellType = (typeof CellType)[keyof typeof CellType];
