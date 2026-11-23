/** Distinguishes ordinary replacement from relocation that preserves independently owned cell state. */
export const MatrixCellUpdateIntent = {
  Relocation: 'relocation',
} as const;

export type MatrixCellUpdateIntent = (typeof MatrixCellUpdateIntent)[keyof typeof MatrixCellUpdateIntent];
