/** Platform-neutral identity of one cell visible to formula evaluation. */
export interface FormulaMetadataCellReference {
  readonly row: number;
  readonly col: number;
  readonly sheetName?: string;
}
