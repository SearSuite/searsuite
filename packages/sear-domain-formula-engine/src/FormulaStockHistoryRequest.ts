/** Normalized request key for a historical market-data lookup. */
export interface FormulaStockHistoryRequest {
  readonly stock: string;
  readonly startDate: number;
  readonly endDate?: number;
  readonly interval: 0 | 1 | 2;
  readonly headers: 0 | 1 | 2;
  readonly properties: readonly number[];
}
