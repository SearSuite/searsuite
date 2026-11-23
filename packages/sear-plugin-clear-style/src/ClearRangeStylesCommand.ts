import { defineSheetCommand, type SheetRangeInput } from '@searsuite/sear-assembly-commands';

export type ClearRangeStylesInput = SheetRangeInput | { ranges: readonly SheetRangeInput[] };

/** Clears explicit formatting from one or more selections, preserving cell data. */
export const ClearRangeStylesCommand = defineSheetCommand<ClearRangeStylesInput>('sheet.clearRangeStyles');
