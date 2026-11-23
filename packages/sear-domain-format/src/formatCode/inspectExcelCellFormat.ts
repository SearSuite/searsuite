import { looksLikeDateTimeFormat } from '../dateTime/looksLikeDateTimeFormat';
import { stripSectionDirectives } from '../literals/stripSectionDirectives';
import { formatExcelDisplay } from './formatExcelDisplay';
import { splitFormatSections } from './sections/splitFormatSections';

export interface ExcelCellFormatInfo {
  readonly format: string;
  readonly color: number;
  readonly parentheses: number;
}

/** Reads Excel's CELL information from a number-format code. */
export function inspectExcelCellFormat(code: string | undefined): ExcelCellFormatInfo {
  if (!code || /^general$/i.test(code) || code === 'G')
    return { format: 'G', color: 0, parentheses: 0 };

  const positive = formatExcelDisplay(1, code);
  const negative = formatExcelDisplay(-1, code);
  const parentheses = positive && 'text' in positive && /^\(.*\)$/.test(positive.text) ? 1 : 0;
  const color = negative && 'color' in negative && negative.color ? 1 : 0;
  const first = stripSectionDirectives(splitFormatSections(code)[0] ?? '');
  const syntax = stripLiterals(first).replace(/\s+/g, '');
  const base = categoryCode(syntax, first);
  return {
    format: `${base}${color ? '-' : ''}${parentheses ? '()' : ''}`,
    color,
    parentheses,
  };
}

function categoryCode(syntax: string, pattern: string): string {
  if (looksLikeDateTimeFormat(pattern)) return dateTimeCode(syntax);
  const mantissa = syntax.split(/e[+-]0+/i)[0] ?? syntax;
  const decimals = Math.min(9, /\.([0#?]+)/.exec(mantissa)?.[1]?.length ?? 0);
  if (/%/.test(syntax)) return `P${decimals}`;
  if (/e[+-]0+/i.test(syntax)) return `S${decimals}`;
  if (/[$€£¥]/.test(syntax)) return `C${decimals}`;
  if (/\?\/\?/.test(syntax)) return 'G';
  if (/[0#?]/.test(syntax)) return `${/#,##0/.test(syntax) ? ',' : 'F'}${decimals}`;
  return 'G';
}

function dateTimeCode(syntax: string): string {
  const lower = syntax.toLowerCase();
  if (/[hs]/.test(lower)) {
    const withSeconds = /s/.test(lower);
    const twelveHour = /am\/pm|a\/p/.test(lower);
    return `D${twelveHour ? withSeconds ? 7 : 6 : withSeconds ? 9 : 8}`;
  }
  if (/m{3,}[-/]y/.test(lower) && !/d/.test(lower)) return 'D3';
  if (/d[-/]m{3,}[-/]y/.test(lower)) return 'D1';
  if (/d[-/]m{3,}/.test(lower)) return 'D2';
  if (/[my][-\/]d/.test(lower) && !/y/.test(lower)) return 'D5';
  return 'D4';
}

function stripLiterals(pattern: string): string {
  let result = '';
  let quoted = false;
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '"') {
      if (quoted && pattern[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && (char === '\\' || char === '_' || char === '*')) {
      index++;
    } else if (!quoted) {
      result += char;
    }
  }
  return result;
}
