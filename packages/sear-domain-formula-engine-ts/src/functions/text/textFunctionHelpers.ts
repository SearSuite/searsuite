import {
  isFormulaArgumentKind,
  FormulaNodeKind,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { forEachFormulaRangeCellWithMetadata, readArg, resolveFormulaRange } from '../shared/helpers';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { coerceText, isFormulaErrorValue, matrixArg, valueError } from './textFormat/FormulaTextValues';
import { foldCase } from './textCaseFold';

export function flattenTextArg(arg: FormulaArg, context: EvalContext, skipUnoccupied = false): string[] | FormulaError {
  if (isBlankScalarInput(arg, context)) return [''];
  if (
    skipUnoccupied &&
    (isFormulaArgumentKind(arg, FormulaNodeKind.Range) || isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange))
  ) {
    const range = resolveFormulaRange(arg, context);
    if (!range || isFormulaErrorValue(range)) return range ?? valueError();
    const result: string[] = [];
    let selectedError: FormulaError | undefined;
    const traversalError = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
      if (cell.source === 'empty') return;
      const text = coerceText(cell.value);
      if (isFormulaErrorValue(text)) {
        selectedError = text;
        return false;
      }
      result.push(text);
    });
    return traversalError ?? selectedError ?? result;
  }
  const values = matrixArg([arg], 0, context);
  if (isFormulaErrorValue(values)) return values;
  const result: string[] = [];
  for (const row of values)
    for (const value of row) {
      const text = coerceText(value);
      if (isFormulaErrorValue(text)) return text;
      result.push(text);
    }
  return result;
}

export function scalarOrMatrix(arg: FormulaArg, context: EvalContext): FormulaValue {
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Range) || isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange)) {
    return matrixArg([arg], 0, context);
  }
  return readArg(arg, context);
}

export function excelWildcardRegex(pattern: string, global = false): RegExp | undefined {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '~' && ['*', '?', '~'].includes(pattern[index + 1] ?? '')) source += escapeRegex(pattern[++index]);
    else if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += escapeRegex(char);
  }
  try {
    return new RegExp(source, `${global ? 'g' : ''}isu`);
  } catch {
    return undefined;
  }
}

export function excelWildcardSearch(pattern: string, text: string, from = 0): number | undefined {
  const folded = foldCase(text);
  let source = '';
  const characters = [...pattern];
  for (let index = 0; index < characters.length; index++) {
    const char = characters[index]!;
    if (char === '~' && ['*', '?', '~'].includes(characters[index + 1] ?? '')) {
      source += escapeRegex(foldCase(characters[++index]!).text);
    } else if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += escapeRegex(foldCase(char).text);
  }
  const expression = new RegExp(source, 'gsu');
  const startIndex = folded.starts.findIndex((offset) => offset >= from);
  if (startIndex < 0) return from === text.length && source === '' ? from : undefined;
  expression.lastIndex = startIndex;
  for (let match = expression.exec(folded.text); match; match = expression.exec(folded.text)) {
    const index = match.index;
    if (index > 0 && folded.starts[index] === folded.starts[index - 1]) {
      expression.lastIndex = index + 1;
      continue;
    }
    return folded.starts[index] ?? text.length;
  }
  return undefined;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function preserveError(value: FormulaValue): FormulaValue | undefined {
  return isFormulaErrorValue(value) ? value : undefined;
}
