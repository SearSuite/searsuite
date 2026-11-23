import type { IFunctionRegistry, FormulaFunctionDescriptor } from '@searsuite/sear-domain-formula-engine';

export interface FormulaSuggestion {
  readonly name: string;
  readonly summary?: string;
  readonly category?: string;
  readonly example?: string;
}

export interface FormulaSignature {
  readonly name: string;
  readonly parameterIndex: number;
  readonly descriptor: FormulaFunctionDescriptor;
}

export interface FormulaInputAnalysis {
  readonly suggestions: readonly FormulaSuggestion[];
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly signature: FormulaSignature | null;
}

interface CallFrame {
  readonly name: string | null;
  parameterIndex: number;
}

const emptyAnalysis: FormulaInputAnalysis = {
  suggestions: [],
  replaceStart: 0,
  replaceEnd: 0,
  signature: null,
};

/** Reads an incomplete formula up to the caret without requiring a valid AST. */
export function analyzeFormulaInput(text: string, caret: number, registry: IFunctionRegistry): FormulaInputAnalysis {
  if (!text.startsWith('=') || caret < 1 || caret > text.length) return emptyAnalysis;

  const frames: CallFrame[] = [];
  let inString = false;
  let inSheetName = false;
  let arrayDepth = 0;
  for (let index = 1; index < caret; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '"') {
        if (text[index + 1] === '"') index += 1;
        else inString = false;
      }
      continue;
    }
    if (inSheetName) {
      if (char === "'") {
        if (text[index + 1] === "'") index += 1;
        else inSheetName = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "'") inSheetName = true;
    else if (char === '{') arrayDepth += 1;
    else if (char === '}') arrayDepth = Math.max(0, arrayDepth - 1);
    else if (arrayDepth === 0 && char === '(') {
      const name = readFunctionName(text, index);
      frames.push({ name: name && registry.has(name) ? name : null, parameterIndex: 0 });
    } else if (arrayDepth === 0 && char === ')') frames.pop();
    else if (arrayDepth === 0 && (char === ',' || char === ';')) {
      const frame = frames.at(-1);
      if (frame) frame.parameterIndex += 1;
    }
  }

  const frame = [...frames].reverse().find((entry) => entry.name && registry.get(entry.name)?.descriptor);
  const descriptor = frame?.name ? registry.get(frame.name)?.descriptor : undefined;
  const signature = frame?.name && descriptor
    ? { name: frame.name, parameterIndex: frame.parameterIndex, descriptor }
    : null;
  if (inString || inSheetName || arrayDepth > 0) return { ...emptyAnalysis, signature };

  let start = caret;
  while (start > 1 && /[A-Za-z0-9._]/.test(text[start - 1])) start -= 1;
  const prefix = text.slice(start, caret);
  const previous = text[start - 1];
  const canStartFunction = previous && (/[=+\-*\/^&(<>,;:]/.test(previous) || /\s/.test(previous));
  if (!/^[A-Za-z_][A-Za-z0-9._]*$/.test(prefix) || !canStartFunction) {
    return { ...emptyAnalysis, signature };
  }
  const normalized = prefix.toUpperCase();
  const suggestions = registry.list()
    .filter((name) => name.startsWith(normalized))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8)
    .map((name) => {
      const descriptor = registry.get(name)?.descriptor;
      return descriptor
        ? { name, summary: descriptor.summary, category: descriptor.category, example: descriptor.example }
        : { name };
    });
  return { suggestions, replaceStart: start, replaceEnd: caret, signature };
}

function readFunctionName(text: string, openParen: number): string | null {
  let end = openParen;
  while (end > 0 && /\s/.test(text[end - 1])) end -= 1;
  let start = end;
  while (start > 0 && /[A-Za-z0-9._]/.test(text[start - 1])) start -= 1;
  const name = text.slice(start, end).toUpperCase();
  return /^[A-Z_][A-Z0-9._]*$/.test(name) ? name : null;
}
