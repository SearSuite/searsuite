/** A source replacement for the reference touching the formula selection. */
export interface FormulaReferenceCycle {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly caret: number;
}

const referenceToken = /(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(?:\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})/g;
const cellReference = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;
const columnReference = /^(\$?)([A-Za-z]{1,3})$/;

/** Finds one cell or whole-column reference and cycles its absolute flags without changing its sheet qualifier. */
export function cycleFormulaReference(text: string, selectionStart: number, selectionEnd: number): FormulaReferenceCycle | null {
  if (!text.startsWith('=')) return null;
  referenceToken.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = referenceToken.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > 0 && /[A-Za-z0-9_.$]/.test(text[start - 1])) continue;
    if (end < text.length && /[A-Za-z0-9_.$]/.test(text[end])) continue;
    if (insideTextLiteral(text, start)) continue;
    if (!match[0].includes('!') && /^\s*\(/.test(text.slice(end))) continue;
    const selected = selectionStart < selectionEnd
      ? selectionStart >= start && selectionEnd <= end
      : selectionStart >= start && selectionStart <= end;
    if (!selected) continue;
    const separator = match[0].lastIndexOf('!');
    const prefix = separator < 0 ? '' : match[0].slice(0, separator + 1);
    const address = separator < 0 ? match[0] : match[0].slice(separator + 1);
    const parts = address.split(':');
    const cycled = parts.map((part) => parts.length === 2 && columnReference.test(part)
      ? cycleColumnReference(part)
      : cycleCellReference(part));
    if (cycled.some((part) => part === null)) return null;
    const replacement = prefix + cycled.join(':');
    return { start, end, replacement, caret: start + replacement.length };
  }
  return null;
}

function cycleColumnReference(value: string): string | null {
  const match = columnReference.exec(value);
  if (!match) return null;
  return match[1] ? match[2] : `$${match[2]}`;
}

function cycleCellReference(value: string): string | null {
  const match = cellReference.exec(value);
  if (!match) return null;
  const [, colMark, column, rowMark, row] = match;
  if (!colMark && !rowMark) return `$${column}$${row}`;
  if (colMark && rowMark) return `${column}$${row}`;
  if (!colMark && rowMark) return `$${column}${row}`;
  return `${column}${row}`;
}

function insideTextLiteral(text: string, position: number): boolean {
  let quoted = false;
  for (let index = 1; index < position; index++) {
    if (text[index] !== '"') continue;
    if (quoted && text[index + 1] === '"') index += 1;
    else quoted = !quoted;
  }
  return quoted;
}
