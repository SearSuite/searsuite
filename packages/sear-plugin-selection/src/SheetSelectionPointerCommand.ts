import { defineSheetCommand } from '@searsuite/sear-assembly-commands';
import { type CellRegion } from '@searsuite/sear-render-registry';

/** Pointer-session transitions owned by the Sheet selection plugin. */
export enum SheetSelectionPointerAction {
  Down = 'down',
  Move = 'move',
  Up = 'up',
  Tick = 'tick',
}

/** Detached input coordinates for a selection pointer transition. */
export interface SheetSelectionPointerInput {
  readonly action: SheetSelectionPointerAction;
  readonly target?: {
    readonly region: CellRegion | undefined;
    readonly startRowIndex: number | undefined;
    readonly startColIndex: number | undefined;
    readonly endRowIndex: number | undefined;
    readonly endColIndex: number | undefined;
  } | null;
  readonly view?: { readonly x: number; readonly y: number };
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
}

/** Routes selection pointer-session changes through the editor command bus. */
export const HandleSheetSelectionPointerCommand =
  defineSheetCommand<SheetSelectionPointerInput>('sheet.selection.pointer');
