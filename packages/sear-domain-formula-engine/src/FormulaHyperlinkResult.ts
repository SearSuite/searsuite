/** Host-neutral hyperlink result projected by a formula renderer. */
export interface FormulaHyperlinkResult {
  readonly kind: 'hyperlink';
  readonly target: string;
  readonly label: string;
}
