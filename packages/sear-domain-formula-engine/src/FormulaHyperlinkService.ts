/** Host policy for validating and normalizing hyperlink targets. */
export interface FormulaHyperlinkService {
  normalizeTarget(target: string): string | undefined;
  /** Opens a validated target in the host; omitted by non-interactive hosts. */
  openTarget?(target: string): void;
}
