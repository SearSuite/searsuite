/** Extracts plain text from persisted rich-text content. */
export function extractRichText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(extractNodeText).join('\n');
}

function extractNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as { type?: unknown; text?: unknown; content?: unknown[] };
  if (typeof value.text === 'string') return value.text;
  return Array.isArray(value.content) ? value.content.map(extractNodeText).join('') : '';
}

/** Formats formula results consistently for rendering and measurement. */
export function formatFormulaValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && (value as { kind?: unknown }).kind === 'text') {
    return (value as { value?: string }).value ?? '';
  }
  if (typeof value === 'object' && (value as { kind?: unknown }).kind === 'error') {
    return (value as { code?: string }).code ?? '';
  }
  if (
    typeof value === 'object' &&
    ((value as { kind?: unknown }).kind === 'cube-member' || (value as { kind?: unknown }).kind === 'cube-set')
  ) {
    return (value as { caption?: string }).caption ?? '';
  }
  if (Array.isArray(value)) return value.map(formatFormulaValue).join(', ');
  return '';
}
