import { defineSheetQuery } from '@searsuite/sear-assembly-commands';
import { type Point } from '@searsuite/sear-foundation-rect';

/** Reads the cell where the current selection began, including reversed ranges. */
export const GetActiveCell = defineSheetQuery<void, Readonly<Point> | null>('sheet.selection.activeCell');
