/** Stable key used to read one RTD subscription. */
export interface FormulaRtdKey {
  readonly progId: string;
  readonly server?: string;
  readonly topics: readonly string[];
}
