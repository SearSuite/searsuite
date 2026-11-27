import { defineSheetCommand } from '@searsuite/sear-assembly-commands';

/** Pointer selection update inside an active embedded editor. */
export interface SheetCellEditorPointerInput {
  readonly type: 'pointerDown' | 'pointerMove';
  readonly point: { readonly x: number; readonly y: number };
  readonly clickCount?: number;
}

/** Command that requests a render pass for the cell editor overlay. */
export const RequestCellEditorRenderCommand = defineSheetCommand('cellEditor.requestRender');

/** Updates the embedded editor's cursor or drag selection. */
export const HandleCellEditorPointerCommand = defineSheetCommand<SheetCellEditorPointerInput>('cellEditor.pointer');

/** Starts the local text-selection drag after the pointer command succeeds. */
export const BeginCellEditorDragSelectionCommand = defineSheetCommand('cellEditor.beginDragSelection');

/** Ends the local text-selection drag and optionally releases pointer capture. */
export const EndCellEditorDragSelectionCommand = defineSheetCommand<{ readonly disposeCapture: boolean }>(
  'cellEditor.endDragSelection',
);
