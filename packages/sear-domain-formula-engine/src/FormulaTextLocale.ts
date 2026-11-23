/** Locale-specific byte and width transforms for legacy text functions. */
export interface FormulaTextLocale {
  readonly locale: string;
  readonly currencySymbol?: string;
  formatCurrency?(number: number, decimals: number): string;
  byteLength(text: string): number;
  sliceByBytes(text: string, startByte: number, byteLength: number): string;
  findByBytes(text: string, search: string, startByte: number, caseSensitive: boolean): number;
  replaceByBytes(text: string, startByte: number, byteLength: number, replacement: string): string;
  toHalfWidth?(text: string): string;
  toFullWidth?(text: string): string;
  toJis?(text: string): string;
  compareText?(left: string, right: string): number;
  characterFromCode?(code: number): string | undefined;
  characterCode?(text: string): number;
  calculationModeLabel?(mode: 'Automatic' | 'Manual'): string;
}
