import { SearError } from '@searsuite/sear-foundation-error';
/** Vertical alignment values supported by the built-in Sheet alignment feature. */
export enum SheetVerticalAlignment {
  Top = 'top',
  Center = 'center',
  Bottom = 'bottom',
}

/** Returns whether an unknown value is a supported Sheet vertical alignment. */
export function isSheetVerticalAlignment(value: unknown): value is SheetVerticalAlignment {
  return Object.values(SheetVerticalAlignment).includes(value as SheetVerticalAlignment);
}

/** Asserts that a value is one of the supported Sheet vertical alignments. */
export function assertSheetVerticalAlignment(value: unknown): asserts value is SheetVerticalAlignment {
  if (isSheetVerticalAlignment(value)) return;
  throw new SearError(`Sheet vertical alignment must be one of: ${Object.values(SheetVerticalAlignment).join(', ')}.`);
}
