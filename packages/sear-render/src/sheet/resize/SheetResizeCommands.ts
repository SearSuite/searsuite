import { defineSheetCommand } from '@searsuite/sear-assembly-commands';

/** Supported resize interaction axis. */
export type SheetResizeAxis = 'row' | 'col';

/** One captured size at the start of a resize drag. */
export interface SheetResizeDragInitialSize {
  readonly index: number;
  readonly size: number;
}

/** Public input for starting a resize drag session. */
export interface SheetBeginResizeDragInput {
  readonly axis: SheetResizeAxis;
  readonly primaryIndex: number;
  readonly initialSizes: readonly SheetResizeDragInitialSize[];
  readonly world: { readonly x: number; readonly y: number };
}

/** Public input for moving an active resize drag session. */
export interface SheetUpdateResizeDragInput {
  readonly world: { readonly x: number; readonly y: number };
}

/** Command that starts resize drag-session state through the command bus. */
export const BeginSheetResizeDragCommand = defineSheetCommand<SheetBeginResizeDragInput>('sheet.resizeDrag.begin');

/** Command that updates resize drag-session state through the command bus. */
export const UpdateSheetResizeDragCommand = defineSheetCommand<SheetUpdateResizeDragInput>('sheet.resizeDrag.update');

/** Command that clears resize drag-session state through the command bus. */
export const EndSheetResizeDragCommand = defineSheetCommand('sheet.resizeDrag.end');
