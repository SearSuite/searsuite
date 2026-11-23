/** Decodes a numeric cell key to zero-based coordinates. */
export function fromCellKey(key: number): [number, number] {
  const col = key % 65536;
  return [(key - col) / 65536, col];
}
