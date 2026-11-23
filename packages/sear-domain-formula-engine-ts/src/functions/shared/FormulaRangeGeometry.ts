import { FormulaRangeSourceKind, type ResolvedFormulaRange } from '@searsuite/sear-domain-formula-engine';

export function formulaRangeWidth(range: ResolvedFormulaRange): number {
  return range.endCol - range.startCol + 1;
}

export function formulaRangeHeight(range: ResolvedFormulaRange): number {
  return range.endRow - range.startRow + 1;
}

export function isCurrentSheetRange(range: ResolvedFormulaRange): boolean {
  return range.source.kind === FormulaRangeSourceKind.CurrentSheet;
}
