import { findSectionDirectives } from '../../literals/findSectionDirectives';
import { type FormatCondition, type FormatSection } from './FormatSection';

export function parseSection(raw: string): FormatSection {
  const directives = findSectionDirectives(raw).map(({ content }) => content);
  const conditionMatch = directives
    .map((directive) => /^([<>=]=?|<>)([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(directive))
    .find(Boolean);
  const color = readFormatColor(directives);
  const fillCharacter = readFillCharacter(raw);
  const locale = readFormatLocale(directives);
  return {
    raw,
    ...(conditionMatch
      ? {
          condition: {
            op: conditionMatch[1] as FormatCondition['op'],
            value: Number(conditionMatch[2]),
          },
        }
      : {}),
    ...(color === undefined ? {} : { color }),
    ...(fillCharacter === undefined ? {} : { fillCharacter }),
    ...(locale === undefined ? {} : { locale }),
  };
}

function readFormatLocale(directives: readonly string[]): string | undefined {
  const localeCode = directives
    .map((directive) => /^\$.*?-([0-9a-f]{3,4})$/i.exec(directive)?.[1])
    .find(Boolean)
    ?.toLowerCase();
  if (!localeCode) return undefined;
  return LocaleByLcid[localeCode];
}

const LocaleByLcid: Readonly<Record<string, string>> = {
  '409': 'en-US',
  '809': 'en-GB',
  '407': 'de-DE',
  '40c': 'fr-FR',
  '410': 'it-IT',
  '411': 'ja-JP',
  '412': 'ko-KR',
  '804': 'zh-CN',
  '404': 'zh-TW',
  '40a': 'es-ES',
  '416': 'pt-BR',
  '419': 'ru-RU',
};

const NamedFormatColors: Readonly<Record<string, string>> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  green: '#008000',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
};

function readFormatColor(directives: readonly string[]): string | undefined {
  for (const content of directives) {
    const directive = content.trim().toLowerCase();
    if (!directive) continue;
    const named = NamedFormatColors[directive];
    if (named) return named;
    const indexed = /^color(\d{1,2})$/.exec(directive);
    if (indexed) return indexedColor(Number(indexed[1]));
  }
  return undefined;
}

function indexedColor(index: number): string | undefined {
  return index >= 1 && index <= IndexedFormatColors.length ? IndexedFormatColors[index - 1] : undefined;
}

const IndexedFormatColors: readonly string[] = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#c0c0c0', '#808080',
  '#9999ff', '#993366', '#ffffcc', '#ccffff', '#660066', '#ff8080', '#0066cc', '#ccccff',
  '#000080', '#ff00ff', '#ffff00', '#00ffff', '#800080', '#800000', '#008080', '#0000ff',
  '#00ccff', '#ccffff', '#ccffcc', '#ffff99', '#99ccff', '#ff99cc', '#cc99ff', '#ffcc99',
  '#3366ff', '#33cccc', '#99cc00', '#ffcc00', '#ff9900', '#ff6600', '#666699', '#969696',
  '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333',
];

function readFillCharacter(raw: string): string | undefined {
  let inQuote = false;
  for (let index = 0; index < raw.length - 1; index += 1) {
    const character = raw[index]!;
    if (character === '"') inQuote = !inQuote;
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (!inQuote && character === '*') return raw[index + 1];
  }
  return undefined;
}
