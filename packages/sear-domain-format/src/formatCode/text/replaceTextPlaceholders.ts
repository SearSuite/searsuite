export function replaceTextPlaceholders(raw: string, value: string): { text: string; hasPlaceholder: boolean } {
  let text = '';
  let inQuote = false;
  let hasPlaceholder = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (character === '\\' && !inQuote) {
      text += character + (raw[++index] ?? '');
    } else if (character === '"') {
      inQuote = !inQuote;
      text += character;
    } else if (character === '@' && !inQuote) {
      text += value;
      hasPlaceholder = true;
    } else {
      text += character;
    }
  }
  return { text, hasPlaceholder };
}
