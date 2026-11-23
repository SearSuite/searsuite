import { formatDateTimePattern } from '../dateTime/formatDateTimePattern';
import { looksLikeDateTimeFormat } from '../dateTime/looksLikeDateTimeFormat';
import { cleanFormatLiterals } from '../literals/cleanFormatLiterals';
import { stripSectionDirectives } from '../literals/stripSectionDirectives';
import { formatNumberPattern } from '../number/formatNumberPattern';
import {
  DefaultSpreadsheetFormatLocale,
  type SpreadsheetErrorValue,
  type SpreadsheetFormatDisplay,
  type SpreadsheetFormatLocale,
  type SpreadsheetFormatValue,
} from '../types/SpreadsheetFormatTypes';
import { parseSection } from './sections/parseSection';
import { selectNumberSection } from './sections/selectNumberSection';
import { splitFormatSections } from './sections/splitFormatSections';
import { conciseSpreadsheetText } from './text/conciseSpreadsheetText';
import { isSpreadsheetErrorValue } from './text/isSpreadsheetErrorValue';
import { isSpreadsheetTextValue } from './text/isSpreadsheetTextValue';
import { replaceTextPlaceholders } from './text/replaceTextPlaceholders';

/** Formats a scalar value and preserves section-level visual metadata. */
export function formatExcelDisplay(
  value: SpreadsheetFormatValue,
  formatText: string,
  locale = DefaultSpreadsheetFormatLocale,
): SpreadsheetFormatDisplay | SpreadsheetErrorValue | null {
  if (isSpreadsheetErrorValue(value)) return value;
  if (Array.isArray(value)) return null;

  const sections = splitFormatSections(formatText).map(parseSection);
  if (typeof value === 'string' || isSpreadsheetTextValue(value)) {
    const text = conciseSpreadsheetText(value);
    const section = sections[3] ?? sections[0];
    const replaced = replaceTextPlaceholders(section?.raw ?? '@', text);
    if (!sections[3] && !replaced.hasPlaceholder) return withSectionMetadata(text, section);
    const displayText = cleanFormatLiterals(replaced.text);
    return withSectionMetadata(displayText, section);
  }
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const section = selectNumberSection(value, sections);
  if (!section) return { text: String(value) };
  const cleaned = stripSectionDirectives(section.raw);
  if (cleaned === '') return withSectionMetadata('', section);
  const sectionLocale = section.locale === undefined ? locale : withLocaleSeparators(locale, section.locale);
  const text = looksLikeDateTimeFormat(cleaned)
    ? formatDateTimePattern(value, cleaned, sectionLocale)
    : formatNumberPattern(value, cleaned, section !== sections[0], sectionLocale);
  if (text === null) return { kind: 'error', code: '#VALUE!' };
  return withSectionMetadata(text, section);
}

function withLocaleSeparators(locale: SpreadsheetFormatLocale, localeName: string): SpreadsheetFormatLocale {
  const parts = new Intl.NumberFormat(localeName).formatToParts(12345.6);
  const decimalSeparator = parts.find((part) => part.type === 'decimal')?.value ?? locale.decimalSeparator;
  const groupSeparator = parts.find((part) => part.type === 'group')?.value ?? locale.groupSeparator;
  return {
    ...locale,
    locale: localeName,
    ...(decimalSeparator === undefined ? {} : { decimalSeparator }),
    ...(groupSeparator === undefined ? {} : { groupSeparator }),
  };
}

function withSectionMetadata(
  text: string,
  section: ReturnType<typeof parseSection> | undefined,
): SpreadsheetFormatDisplay {
  return {
    text,
    ...(section?.color === undefined ? {} : { color: section.color }),
    ...(section?.fillCharacter === undefined ? {} : { fillCharacter: section.fillCharacter }),
  };
}
