export interface SpreadsheetFormatLocale {
  readonly locale: string;
  readonly datePattern: string;
  readonly timePattern: string;
  readonly dateTimePattern: string;
  readonly decimalSeparator?: string;
  readonly groupSeparator?: string;
}

/** Display metadata selected from one Excel number-format section. */
export interface SpreadsheetFormatDisplay {
  readonly text: string;
  readonly color?: string;
  readonly fillCharacter?: string;
}

export interface SpreadsheetTextValue {
  readonly kind: 'text';
  readonly value: string;
}

export interface SpreadsheetErrorValue {
  readonly kind: 'error';
  readonly code: string;
}

export type SpreadsheetFormatValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SpreadsheetTextValue
  | SpreadsheetErrorValue
  | readonly SpreadsheetFormatValue[]
  | readonly (readonly SpreadsheetFormatValue[])[];

export interface ExcelDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly phantomLeapDay?: boolean;
}

export const DefaultSpreadsheetFormatLocale: SpreadsheetFormatLocale = {
  locale: 'en',
  datePattern: 'yyyy-m-d',
  timePattern: 'h:mm:ss',
  dateTimePattern: 'yyyy-m-d h:mm:ss',
  decimalSeparator: '.',
  groupSeparator: ',',
};
