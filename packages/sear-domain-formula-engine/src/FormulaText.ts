/** Text value carrying an explicit numeric coercion policy. */
export interface FormulaText {
  kind: 'text';
  value: string;
  numericCoercion: 'allow' | 'deny';
}
