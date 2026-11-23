/** Encodes zero-based coordinates as one numeric cell key. */
export function cellKey(row: number, col: number): number {
  return row * 65536 + col;
}
