/** Reads comma-separated labels with doubled-quote escaping; malformed input remains a single literal. */
export function parseDropdownSelection(text: string): string[] {
  const result: string[] = [];
  let index = 0;
  while (index < text.length) {
    while (text[index] === ' ') index++;
    let value = '';
    if (text[index] === '"') {
      index++;
      let closed = false;
      while (index < text.length) {
        const char = text[index++];
        if (char !== '"') {
          value += char;
          continue;
        }
        if (text[index] === '"') {
          value += '"';
          index++;
        } else {
          closed = true;
          break;
        }
      }
      if (!closed) return [text];
      while (text[index] === ' ') index++;
      if (index < text.length && text[index] !== ',') return [text];
    } else {
      const start = index;
      while (index < text.length && text[index] !== ',') index++;
      value = text.slice(start, index).trim();
    }
    result.push(value);
    if (index < text.length) {
      index++;
      if (index === text.length) result.push('');
    }
  }
  return result;
}

/** Uses an exact option label when comma parsing cannot describe valid choices. */
export function resolveDropdownSelection(text: string, availableLabels: readonly string[]): string[] {
  const parsed = parseDropdownSelection(text);
  return parsed.every((label) => availableLabels.includes(label)) || !availableLabels.includes(text)
    ? parsed : [text];
}

/** Serializes labels without losing embedded commas, quotes or surrounding spaces. */
export function formatDropdownSelection(values: readonly string[]): string {
  return values
    .map((value) => (/[",\r\n]/.test(value) || value.trim() !== value ? '"' + value.replace(/"/g, '""') + '"' : value))
    .join(', ');
}
