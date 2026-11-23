import { type FormulaTextLocale } from '@searsuite/sear-domain-formula-engine';
import { findCaseInsensitive } from './textCaseFold';
import { gbkCharacterCode } from './gbkCodePage';

interface ByteUnit {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

type CharWidth = (codePoint: number) => number;

const halfWidthKanaToFullWidth = new Map<string, string>([
  ['｡', '。'],
  ['｢', '「'],
  ['｣', '」'],
  ['､', '、'],
  ['･', '・'],
  ['ｦ', 'ヲ'],
  ['ｧ', 'ァ'],
  ['ｨ', 'ィ'],
  ['ｩ', 'ゥ'],
  ['ｪ', 'ェ'],
  ['ｫ', 'ォ'],
  ['ｬ', 'ャ'],
  ['ｭ', 'ュ'],
  ['ｮ', 'ョ'],
  ['ｯ', 'ッ'],
  ['ｰ', 'ー'],
  ['ｱ', 'ア'],
  ['ｲ', 'イ'],
  ['ｳ', 'ウ'],
  ['ｴ', 'エ'],
  ['ｵ', 'オ'],
  ['ｶ', 'カ'],
  ['ｷ', 'キ'],
  ['ｸ', 'ク'],
  ['ｹ', 'ケ'],
  ['ｺ', 'コ'],
  ['ｻ', 'サ'],
  ['ｼ', 'シ'],
  ['ｽ', 'ス'],
  ['ｾ', 'セ'],
  ['ｿ', 'ソ'],
  ['ﾀ', 'タ'],
  ['ﾁ', 'チ'],
  ['ﾂ', 'ツ'],
  ['ﾃ', 'テ'],
  ['ﾄ', 'ト'],
  ['ﾅ', 'ナ'],
  ['ﾆ', 'ニ'],
  ['ﾇ', 'ヌ'],
  ['ﾈ', 'ネ'],
  ['ﾉ', 'ノ'],
  ['ﾊ', 'ハ'],
  ['ﾋ', 'ヒ'],
  ['ﾌ', 'フ'],
  ['ﾍ', 'ヘ'],
  ['ﾎ', 'ホ'],
  ['ﾏ', 'マ'],
  ['ﾐ', 'ミ'],
  ['ﾑ', 'ム'],
  ['ﾒ', 'メ'],
  ['ﾓ', 'モ'],
  ['ﾔ', 'ヤ'],
  ['ﾕ', 'ユ'],
  ['ﾖ', 'ヨ'],
  ['ﾗ', 'ラ'],
  ['ﾘ', 'リ'],
  ['ﾙ', 'ル'],
  ['ﾚ', 'レ'],
  ['ﾛ', 'ロ'],
  ['ﾜ', 'ワ'],
  ['ﾝ', 'ン'],
  ['ﾞ', '゛'],
  ['ﾟ', '゜'],
]);

const fullWidthKanaToHalfWidth = new Map([...halfWidthKanaToFullWidth.entries()].map(([half, full]) => [full, half]));

/** Excel-compatible text locale where every Unicode code point counts as one byte. */
export const SingleByteFormulaTextLocale: FormulaTextLocale = createFormulaTextLocale({
  locale: 'en',
  charWidth: () => 1,
  toHalfWidth: toHalfWidthText,
  toFullWidth: toFullWidthText,
  toJis: toFullWidthText,
});

/** Excel-compatible CJK text locale where wide CJK code points count as two bytes. */
export const CjkFormulaTextLocale: FormulaTextLocale = createFormulaTextLocale({
  locale: 'zh',
  charWidth: cjkCharWidth,
  characterCode: gbkCharacterCode,
  characterFromCode: (code) => (code >= 0xa000 && code <= 0xffff ? '\uFFFD' : undefined),
  calculationModeLabel: (mode) => (mode === 'Automatic' ? '自动' : '手动'),
  compareText: (left, right) =>
    /\p{Script=Han}/u.test(left) && /\p{Script=Han}/u.test(right)
      ? left.localeCompare(right, 'zh-CN', { sensitivity: 'base' })
      : left.localeCompare(right, 'en-US', { sensitivity: 'base' }),
  toHalfWidth: toHalfWidthText,
  toFullWidth: toFullWidthText,
  toJis: toFullWidthText,
});

/** Creates a byte-oriented text locale from a character-width strategy. */
export function createFormulaTextLocale(input: {
  readonly locale: string;
  readonly charWidth: CharWidth;
  readonly toHalfWidth?: (text: string) => string;
  readonly toFullWidth?: (text: string) => string;
  readonly toJis?: (text: string) => string;
  readonly compareText?: (left: string, right: string) => number;
  readonly characterFromCode?: (code: number) => string | undefined;
  readonly characterCode?: (text: string) => number;
  readonly calculationModeLabel?: (mode: 'Automatic' | 'Manual') => string;
}): FormulaTextLocale {
  return {
    locale: input.locale,
    byteLength(text) {
      return buildByteUnits(text, input.charWidth).reduce((sum, unit) => sum + unit.end - unit.start, 0);
    },
    sliceByBytes(text, startByte, byteLength) {
      return sliceByBytes(text, startByte, byteLength, input.charWidth);
    },
    findByBytes(text, search, startByte, caseSensitive) {
      return findByBytes(text, search, startByte, caseSensitive, input.charWidth);
    },
    replaceByBytes(text, startByte, byteLength, replacement) {
      return replaceByBytes(text, startByte, byteLength, replacement, input.charWidth);
    },
    ...(input.toHalfWidth === undefined ? {} : { toHalfWidth: input.toHalfWidth }),
    ...(input.toFullWidth === undefined ? {} : { toFullWidth: input.toFullWidth }),
    ...(input.toJis === undefined ? {} : { toJis: input.toJis }),
    ...(input.compareText === undefined ? {} : { compareText: input.compareText }),
    ...(input.characterFromCode === undefined ? {} : { characterFromCode: input.characterFromCode }),
    ...(input.characterCode === undefined ? {} : { characterCode: input.characterCode }),
    ...(input.calculationModeLabel === undefined ? {} : { calculationModeLabel: input.calculationModeLabel }),
  };
}

function sliceByBytes(text: string, startByte: number, byteLength: number, charWidth: CharWidth): string {
  const start = Math.max(1, Math.trunc(startByte));
  const length = Math.max(0, Math.trunc(byteLength));
  const end = start + length;
  return buildByteUnits(text, charWidth)
    .filter((unit) => unit.start < end && unit.end > start)
    .map((unit) =>
      unit.start >= start && unit.end <= end
        ? unit.text
        : ' '.repeat(Math.min(unit.end, end) - Math.max(unit.start, start)),
    )
    .join('');
}

function findByBytes(
  text: string,
  search: string,
  startByte: number,
  caseSensitive: boolean,
  charWidth: CharWidth,
): number {
  const units = buildByteUnits(text, charWidth);
  const start = Math.max(1, Math.trunc(startByte));
  if (search === '' && start === (units.at(-1)?.end ?? 1)) return start;
  const startIndex = units.findIndex((unit) => unit.start >= start);
  if (startIndex < 0) return 0;

  const haystack = units
    .slice(startIndex)
    .map((unit) => unit.text)
    .join('');
  const matchIndex = caseSensitive ? haystack.indexOf(search) : findCaseInsensitive(haystack, search)?.start ?? -1;
  if (matchIndex < 0) return 0;

  const prefix = [...haystack.slice(0, matchIndex)].length;
  const matchedUnit = units[startIndex + prefix];
  return matchedUnit?.start ?? 0;
}

function replaceByBytes(
  text: string,
  startByte: number,
  byteLength: number,
  replacement: string,
  charWidth: CharWidth,
): string {
  const start = Math.max(1, Math.trunc(startByte));
  const end = start + Math.max(0, Math.trunc(byteLength));
  const units = buildByteUnits(text, charWidth);
  const before = sliceByBytes(text, 1, start - 1, charWidth);
  const after = sliceByBytes(text, end, Math.max(0, units.at(-1)?.end ?? 1) - end, charWidth);
  return `${before}${replacement}${after}`;
}

function buildByteUnits(text: string, charWidth: CharWidth): ByteUnit[] {
  const units: ByteUnit[] = [];
  let offset = 1;
  for (const char of text) {
    const width = Math.max(1, Math.trunc(charWidth(char.codePointAt(0) ?? 0)));
    units.push({ text: char, start: offset, end: offset + width });
    offset += width;
  }
  return units;
}

function cjkCharWidth(codePoint: number): number {
  if (codePoint > 0xffff) return 4;
  if (codePoint <= 0x7f) return 1;
  if (codePoint >= 0xff61 && codePoint <= 0xff9f) return 1;
  return isCjkWideCodePoint(codePoint) ? 2 : 1;
}

function isCjkWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function toHalfWidthText(text: string): string {
  return [...text]
    .map((char) => {
      const decomposed = [...char.normalize('NFD')];
      if (decomposed.length === 2 && (decomposed[1] === '\u3099' || decomposed[1] === '\u309A')) {
        const base = fullWidthKanaToHalfWidth.get(decomposed[0]!);
        if (base) return base + (decomposed[1] === '\u3099' ? 'ﾞ' : 'ﾟ');
      }
      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint === 0x3000) return ' ';
      if (codePoint >= 0xff01 && codePoint <= 0xff5e) return String.fromCodePoint(codePoint - 0xfee0);
      return fullWidthKanaToHalfWidth.get(char) ?? char;
    })
    .join('');
}

function toFullWidthText(text: string): string {
  const converted = [...text]
    .map((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint === 0x20) return '　';
      if (codePoint >= 0x21 && codePoint <= 0x7e) return String.fromCodePoint(codePoint + 0xfee0);
      return halfWidthKanaToFullWidth.get(char) ?? char;
    })
    .join('');
  return converted.replace(/([\u30A0-\u30FF])([゛゜])/g, (_match, base: string, mark: string) =>
    (base + (mark === '゛' ? '\u3099' : '\u309A')).normalize('NFC'),
  );
}
