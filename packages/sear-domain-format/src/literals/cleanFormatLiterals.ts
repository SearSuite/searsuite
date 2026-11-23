export function cleanFormatLiterals(value: string): string {
  let result = '';
  let inQuote = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '"') {
      if (inQuote && value[i + 1] === '"') {
        result += '"';
        i++;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === '\\') {
      result += value[++i] ?? '';
      continue;
    }
    if (!inQuote && ch === '_') {
      result += ' ';
      i++;
      continue;
    }
    if (!inQuote && ch === '*') {
      result += value[++i] ?? '';
      continue;
    }
    result += ch;
  }
  return result;
}
