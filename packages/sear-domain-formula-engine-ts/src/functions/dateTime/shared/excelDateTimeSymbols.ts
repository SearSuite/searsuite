import { type FormulaDateTimeSymbols } from '@searsuite/sear-domain-formula-engine';

/** Built-in locale identifiers registered by sear-plugin-i18n. */
export const BuiltInExcelDateTimeLocaleId = {
  English: 'en',
  Chinese: 'zh',
} as const;

export type BuiltInExcelDateTimeLocaleId =
  (typeof BuiltInExcelDateTimeLocaleId)[keyof typeof BuiltInExcelDateTimeLocaleId];

/** English symbols consumed by the shared Excel-compatible date/time parser. */
export const EnglishExcelDateTimeSymbols: FormulaDateTimeSymbols = {
  months: [
    { text: 'JAN', month: 1 },
    { text: 'JANUARY', month: 1 },
    { text: 'FEB', month: 2 },
    { text: 'FEBRUARY', month: 2 },
    { text: 'MAR', month: 3 },
    { text: 'MARCH', month: 3 },
    { text: 'APR', month: 4 },
    { text: 'APRIL', month: 4 },
    { text: 'MAY', month: 5 },
    { text: 'JUN', month: 6 },
    { text: 'JUNE', month: 6 },
    { text: 'JUL', month: 7 },
    { text: 'JULY', month: 7 },
    { text: 'AUG', month: 8 },
    { text: 'AUGUST', month: 8 },
    { text: 'SEP', month: 9 },
    { text: 'SEPT', month: 9 },
    { text: 'SEPTEMBER', month: 9 },
    { text: 'OCT', month: 10 },
    { text: 'OCTOBER', month: 10 },
    { text: 'NOV', month: 11 },
    { text: 'NOVEMBER', month: 11 },
    { text: 'DEC', month: 12 },
    { text: 'DECEMBER', month: 12 },
  ],
  meridiems: [
    { text: 'AM', period: 'am' },
    { text: 'PM', period: 'pm' },
  ],
};

/** Chinese symbols consumed by the shared Excel-compatible date/time parser. */
export const ChineseExcelDateTimeSymbols: FormulaDateTimeSymbols = {
  units: {
    year: ['年'],
    month: ['月'],
    day: ['日', '号'],
  },
  meridiems: [
    { text: '上午', period: 'am' },
    { text: '下午', period: 'pm' },
  ],
};
