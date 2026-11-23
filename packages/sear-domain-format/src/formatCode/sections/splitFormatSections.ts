export function splitFormatSections(formatText: string): string[] {
  const sections: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < formatText.length; i++) {
    const ch = formatText[i]!;
    if (ch === '\\') {
      current += ch + (formatText[++i] ?? '');
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    if (ch === ';' && !inQuote) {
      sections.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  sections.push(current);
  return sections;
}
