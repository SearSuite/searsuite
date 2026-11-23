/** Completes unmatched formula parentheses when the final token can end an argument. */
export function completeFormulaForCommit(text: string): string {
  if (!text.startsWith('=') || text.length < 2) return text;

  let quote: '"' | "'" | null = null;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char !== quote) continue;
      if (text[index + 1] === quote) index += 1;
      else quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (bracketDepth === 0 && char === '(') parenthesisDepth += 1;
    else if (bracketDepth === 0 && char === ')') {
      parenthesisDepth -= 1;
      if (parenthesisDepth < 0) return text;
    }
  }

  const trimmed = text.trimEnd();
  if (quote || bracketDepth > 0 || parenthesisDepth === 0 || /[=+\-*/^&,:;(]$/.test(trimmed)) return text;
  return `${trimmed}${')'.repeat(parenthesisDepth)}${text.slice(trimmed.length)}`;
}
