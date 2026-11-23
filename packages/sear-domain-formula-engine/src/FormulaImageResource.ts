/** Host-neutral image resource returned by an image loader. */
export interface FormulaImageResource {
  readonly assetId: string;
  readonly source: string;
  readonly intrinsicWidth?: number;
  readonly intrinsicHeight?: number;
}
