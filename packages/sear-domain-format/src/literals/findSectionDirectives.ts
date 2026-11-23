export interface SectionDirective {
  start: number;
  end: number;
  content: string;
}

export function findSectionDirectives(section: string): SectionDirective[] {
  const directives: SectionDirective[] = [];
  let inQuote = false;
  for (let index = 0; index < section.length; index += 1) {
    const character = section[index];
    if (character === '\\' || character === '_' || character === '*') {
      index += 1;
      continue;
    }
    if (character === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote || character !== '[') continue;
    const end = section.indexOf(']', index + 1);
    if (end < 0) continue;
    directives.push({ start: index, end: end + 1, content: section.slice(index + 1, end) });
    index = end;
  }
  return directives;
}
