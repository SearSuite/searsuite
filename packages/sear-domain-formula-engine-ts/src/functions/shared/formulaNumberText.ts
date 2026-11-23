/** Expands small scientific notation for spreadsheet text coercion. */
export function formulaNumberText(value: number): string {
  const text = String(value);
  const scientific = /^(-?)(\d+)(?:\.(\d+))?e-(\d+)$/i.exec(text);
  if (!scientific) return text;
  const digits = scientific[2] + (scientific[3] ?? '');
  const decimalIndex = scientific[2].length - Number(scientific[4]);
  if (decimalIndex <= 0) return `${scientific[1]}0.${'0'.repeat(-decimalIndex)}${digits}`;
  return `${scientific[1]}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}
