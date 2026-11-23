/** One workbook-qualified reference projected onto the currently mounted sheet. */
export interface FormulaCrossSheetReference {
  readonly start: [number, number];
  readonly end: [number, number];
  readonly index: number;
}

/** Optional workbook-owned source for cross-sheet formula reference overlays. */
export abstract class FormulaCrossSheetHighlightSource {
  public static readonly symbol = Symbol.for('FormulaCrossSheetHighlightSource');
  public abstract getReferences(
    selectionRevision: number,
    selectionSource?: string,
  ): readonly FormulaCrossSheetReference[];
}
