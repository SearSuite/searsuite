/** Persisted cell payload stored in the sheet matrix. */
export interface CellMatrixElement {
  /** Cell type identifier owned by the cell type catalog. */
  type: string;
  /** Raw value whose shape is owned by the cell type. */
  value?: unknown;
  /** Formula source text for formula cells; calculated results live in formula plugin state. */
  formula?: string;
  /** Array evaluation mode used when the formula was entered. */
  formulaEvaluationMode?: 'dynamic' | 'legacy';
}
