import { SearError } from '@searsuite/sear-foundation-error';
/** Horizontal alignment values supported by the built-in Sheet alignment feature. */
export enum SheetHorizontalAlignment {
  Left = 'left',
  Center = 'center',
  Right = 'right',
}

/** Returns whether an unknown value is a supported Sheet horizontal alignment. */
export function isSheetHorizontalAlignment(value: unknown): value is SheetHorizontalAlignment {
  return Object.values(SheetHorizontalAlignment).includes(value as SheetHorizontalAlignment);
}

/** Asserts that a value is one of the supported Sheet horizontal alignments. */
export function assertSheetHorizontalAlignment(value: unknown): asserts value is SheetHorizontalAlignment {
  if (isSheetHorizontalAlignment(value)) return;
  throw new SearError(`Sheet alignment must be one of: ${Object.values(SheetHorizontalAlignment).join(', ')}.`);
}
