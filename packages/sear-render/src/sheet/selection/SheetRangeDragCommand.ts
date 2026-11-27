import { defineSheetCommand } from '@searsuite/sear-assembly-commands';
import { type PointerCapturePoint } from '@searsuite/sear-render-input';

/** Canonical phases of a local range-border gesture. */
export const SheetRangeDragAction = {
  Begin: 'begin',
  FillBegin: 'fill-begin',
  Update: 'update',
  Release: 'release',
  Cancel: 'cancel',
  Tick: 'tick',
} as const;

/** Portable inputs for one local gesture, never persisted as document state. */
export type SheetRangeDragInput =
  | {
      readonly action:
        | typeof SheetRangeDragAction.Begin
        | typeof SheetRangeDragAction.FillBegin
        | typeof SheetRangeDragAction.Update
        | typeof SheetRangeDragAction.Release;
      readonly point: PointerCapturePoint;
    }
  | { readonly action: typeof SheetRangeDragAction.Cancel | typeof SheetRangeDragAction.Tick };

export const HandleSheetRangeDragCommand = defineSheetCommand<SheetRangeDragInput>('sheet.selection.rangeDrag');
