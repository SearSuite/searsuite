export function applyPlaceholderWidth(value: string, pattern: string): string {
  if (pattern.includes('0')) return value.padStart(pattern.length, '0');
  if (pattern.includes('?')) return value.padStart(pattern.length, ' ');
  return value;
}
