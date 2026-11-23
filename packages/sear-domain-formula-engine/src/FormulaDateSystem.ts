/** Workbook date serial systems supported by formula evaluation. */
export const FormulaDateSystem = {
  Excel1900: 1900,
  Excel1904: 1904,
} as const;

export type FormulaDateSystem = typeof FormulaDateSystem[keyof typeof FormulaDateSystem];
