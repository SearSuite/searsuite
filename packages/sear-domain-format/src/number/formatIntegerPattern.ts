import { type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';
import { groupInteger } from './groupInteger';

export function formatIntegerPattern(integerText: string, pattern: string, locale: SpreadsheetFormatLocale): string {
  const tokens = tokenizeIntegerPattern(pattern);
  const hasCustomLiterals = tokens.some((token) => token.kind === 'literal' && token.text !== ',');
  if (!hasCustomLiterals) {
    const placeholders = tokens.filter((token) => token.kind === 'placeholder');
    if (integerText === '0' && !placeholders.some((token) => token.text === '0')) {
      return ' '.repeat(placeholders.filter((token) => token.text === '?').length);
    }
    let digitIndex = integerText.length - 1;
    let output = '';
    for (let index = placeholders.length - 1; index >= 0; index -= 1) {
      const placeholder = placeholders[index]!;
      if (digitIndex >= 0) output = integerText[digitIndex--] + output;
      else if (placeholder.text === '0') output = '0' + output;
      else if (placeholder.text === '?') output = ' ' + output;
    }
    while (digitIndex >= 0) output = integerText[digitIndex--] + output;
    return pattern.includes(',') ? groupInteger(output, locale.groupSeparator) : output;
  }

  let digitIndex = integerText.length - 1;
  let output = '';
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.kind === 'placeholder') {
      if (digitIndex >= 0) output = integerText[digitIndex--] + output;
      else if (token.text === '0') output = '0' + output;
      else if (token.text === '?') output = ' ' + output;
    } else {
      output = token.text + output;
    }
  }
  while (digitIndex >= 0) output = integerText[digitIndex--] + output;
  return output.replace(/^[,\s-]+(?=\d)/, '');
}

type IntegerPatternToken = { kind: 'placeholder' | 'literal'; text: string };

function tokenizeIntegerPattern(pattern: string): IntegerPatternToken[] {
  const tokens: IntegerPatternToken[] = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === '"') {
      let text = '';
      index += 1;
      while (index < pattern.length) {
        if (pattern[index] === '"') {
          if (pattern[index + 1] !== '"') break;
          text += '"';
          index += 2;
          continue;
        }
        text += pattern[index];
        index += 1;
      }
      if (text) tokens.push({ kind: 'literal', text });
    } else if (character === '\\' || character === '_') {
      tokens.push({ kind: 'literal', text: character === '_' ? ' ' : pattern[index + 1] ?? '' });
      index += 1;
    } else if (character === '*') {
      index += 1;
    } else {
      tokens.push({ kind: '0#?'.includes(character) ? 'placeholder' : 'literal', text: character });
    }
  }
  return tokens;
}
