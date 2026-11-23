export function findNumericPlaceholder(pattern: string, reverse: boolean): number {
  let result = -1;
  let inQuote = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === '\\') {
      i++;
      continue;
    }
    if (!inQuote && (ch === '0' || ch === '#' || ch === '?')) {
      if (!reverse) return i;
      result = i;
    }
  }
  return result;
}
