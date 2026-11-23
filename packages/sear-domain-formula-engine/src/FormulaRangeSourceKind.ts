/** Stable source kinds for resolved formula ranges. */
export const FormulaRangeSourceKind = {
  CurrentSheet: 'currentSheet',
  WorkbookSheet: 'workbookSheet',
} as const;

/** Type contract carried by the canonical FormulaRangeSourceKind value. */
export type FormulaRangeSourceKind = (typeof FormulaRangeSourceKind)[keyof typeof FormulaRangeSourceKind];
