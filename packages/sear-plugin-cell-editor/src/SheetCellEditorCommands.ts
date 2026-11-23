import { defineSheetCommand, type SheetCommandResult } from '@searsuite/sear-assembly-commands';
import { type DocCursorDirection } from '@searsuite/sear-domain-commands';
import { type Point } from '@searsuite/sear-foundation-rect';
import { type TextInputEvent } from '@searsuite/sear-render-input';
import { type FormulaEditDraft } from './formulaAssist/FormulaReferencePick';
import { type PickedReferenceKind } from './formulaAssist/formatPickedReference';
import {
  type SheetCellEditorExitReason,
  type SheetCellEditorKind,
  type SheetCellEditorPipelineName,
} from './SheetCellEditorPipelineNames';

/** Public input used to enter cell edit mode. */
export interface SheetBeginCellEditInput {
  readonly anchor: Point;
  readonly focus: Point;
  readonly editor: SheetCellEditorKind;
}

/** Cell target for opening an embedded edit session. */
export interface SheetOpenCellEditorInput {
  readonly row: number;
  readonly column: number;
  readonly replaceContent?: boolean;
}

/** Optional selection change applied while committing an edit session. */
export interface SheetCellEditSelectionInput {
  readonly anchor: Point;
  readonly focus: Point;
}

/** Public input used to commit the active edit session. */
export interface SheetCommitCellEditInput {
  readonly reason?: SheetCellEditorExitReason;
  readonly historyGroup?: SheetCommandResult['historyGroup'];
  /** Applies the entered value to every cell in the current selected rectangle. */
  readonly fillSelection?: boolean;
  readonly nextSelection?: SheetCellEditSelectionInput;
  readonly pipelineName?: SheetCellEditorPipelineName;
}

/** Public input used to cancel the active edit session. */
export interface SheetCancelCellEditInput {
  readonly restoreOriginalDocument?: boolean;
}

/** Document cursor position inside the active cell editor session. */
export interface SheetDocumentCursorPositionInput {
  readonly path: readonly number[];
  readonly offset: number;
}

/** Local document input action run inside the command boundary. */
export type SheetDocumentInputCommandInput =
  | TextInputEvent
  | { readonly kind: 'delete'; readonly direction?: 'backward' | 'forward'; readonly byWord?: boolean }
  | { readonly kind: 'arrow'; readonly direction: DocCursorDirection; readonly shiftKey: boolean }
  | { readonly kind: 'lineBoundary'; readonly boundary: 'start' | 'end'; readonly shiftKey: boolean }
  | { readonly kind: 'wordBoundary'; readonly boundary: 'previous' | 'next'; readonly shiftKey: boolean }
  | { readonly kind: 'selectAll' }
  | { readonly kind: 'softEnter' }
  | {
      readonly kind: 'keyDown';
      readonly key: string;
      readonly ctrlKey?: boolean;
      readonly metaKey?: boolean;
      readonly shiftKey?: boolean;
    }
  | {
      readonly kind: 'setSelection';
      readonly anchor: SheetDocumentCursorPositionInput;
      readonly head: SheetDocumentCursorPositionInput;
    };

/** Document selection input expressed as anchor/head coordinates. */
export interface SheetDocumentSelectionCommandInput {
  /** Selection anchor as [paragraphIndex, textOffset]. */
  readonly anchor: readonly [number, number];
  /** Selection head as [paragraphIndex, textOffset]. */
  readonly head: readonly [number, number];
}

/** Inline text-style patch applied to the active embedded cell editor. */
export interface SheetInlineStyleCommandInput {
  readonly attrs: Readonly<Record<string, unknown>>;
}

/** Pointer selection update inside an active embedded editor. */
export interface SheetCellEditorPointerInput {
  readonly type: 'pointerDown' | 'pointerMove';
  readonly point: { readonly x: number; readonly y: number };
  readonly clickCount?: number;
}

/** Formula reference replacement while an edit session is active. */
export interface SheetFormulaReferenceReplacementInput {
  readonly reference: string;
  readonly start: number;
  readonly end: number;
  /** Present when the replacement begins a pointer-based reference pick. */
  readonly pickStart?: Point;
  readonly pickKind?: PickedReferenceKind;
}

/** Command that enters cell edit mode. */
export const BeginCellEditCommand = defineSheetCommand<SheetBeginCellEditInput>('cell.beginEdit');

/** Command that opens the embedded editor and enters cell edit mode atomically. */
export const OpenCellEditorCommand = defineSheetCommand<SheetOpenCellEditorInput>('cell.openEditor');

/** Command that commits the active cell edit session. */
export const CommitCellEditCommand = defineSheetCommand<SheetCommitCellEditInput | void>('cell.commitEdit');

/** Inserts the host wall-clock date or time as a static numeric cell value. */
export const InsertCurrentDateTimeCommand = defineSheetCommand<'date' | 'time'>('cell.insertCurrentDateTime');

/** Command that cancels the active cell edit session. */
export const CancelCellEditCommand = defineSheetCommand<SheetCancelCellEditInput | void>('cell.cancelEdit');

/** Command that requests a render pass for the cell editor overlay. */
export const RequestCellEditorRenderCommand = defineSheetCommand('cellEditor.requestRender');

/** Command that executes local document input while editing a cell. */
export const HandleDocumentInputCommand = defineSheetCommand<SheetDocumentInputCommandInput>('document.input');

/** Updates the embedded editor's cursor or drag selection. */
export const HandleCellEditorPointerCommand = defineSheetCommand<SheetCellEditorPointerInput>('cellEditor.pointer');

/** Starts the local text-selection drag after the pointer command succeeds. */
export const BeginCellEditorDragSelectionCommand = defineSheetCommand('cellEditor.beginDragSelection');

/** Ends the local text-selection drag and optionally releases pointer capture. */
export const EndCellEditorDragSelectionCommand = defineSheetCommand<{ readonly disposeCapture: boolean }>(
  'cellEditor.endDragSelection',
);

/** Replaces the picked formula reference in the active edit session. */
export const ReplaceFormulaReferenceCommand = defineSheetCommand<SheetFormulaReferenceReplacementInput>(
  'formula.replacePickedReference',
);

/** Ends a pointer-based formula reference pick without changing the draft. */
export const EndFormulaReferencePickCommand = defineSheetCommand('formula.endReferencePick');

/** Command that updates the rich-document selection inside the cell editor. */
export const UpdateCellEditorDocumentSelectionCommand = defineSheetCommand<SheetDocumentSelectionCommandInput>(
  'cellEditor.updateDocumentSelection',
);

/** Command used by toolbar integrations to update rich-text inline styles. */
export const SetCellInlineStyleCommand = defineSheetCommand<SheetInlineStyleCommandInput>('cellEditor.setInlineStyle');

/** Accepts a registered function suggestion without committing the cell edit. */
export const AcceptFormulaSuggestionCommand = defineSheetCommand<{ readonly name: string }>('formula.acceptSuggestion');

/** Moves the highlighted function suggestion by item, page, or list boundary. */
export type FormulaSuggestionMove =
  | { readonly direction: -1 | 1; readonly step?: 'item' | 'page' }
  | { readonly boundary: 'start' | 'end' };

export const MoveFormulaSuggestionCommand = defineSheetCommand<FormulaSuggestionMove>(
  'formula.moveSuggestion',
);

/** Updates the formula-assist anchor after editor layout changes. */
export const UpdateFormulaAssistAnchorCommand = defineSheetCommand<{ readonly x: number; readonly y: number }>(
  'formula.updateAssistAnchor',
);

/** Cycles the reference at the formula caret through relative and absolute modes. */
export const CycleFormulaReferenceCommand = defineSheetCommand('formula.cycleReference');

/** Restores a formula draft after a workbook sheet switch. */
export const RestoreFormulaEditDraftCommand = defineSheetCommand<{
  readonly draft: FormulaEditDraft;
  readonly reference?: string;
}>('formula.restoreEditDraft');

/** Opens the current cell's edit session for an external formula input surface. */
export const StartFormulaBarEditCommand = defineSheetCommand('cellEditor.formulaBar.start');

/** Replaces the active edit-session text and synchronizes its caret range. */
export const SetFormulaBarDraftCommand = defineSheetCommand<{
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}>('cellEditor.formulaBar.setDraft');

/** Routes formula-bar keys through the same edit and navigation behavior as grid input. */
export type SheetFormulaBarKeyInput =
  | { readonly action: 'enter'; readonly shiftKey: boolean; readonly primaryModifier: boolean }
  | { readonly action: 'tab'; readonly shiftKey: boolean }
  | { readonly action: 'softEnter' | 'suggestionUp' | 'suggestionDown' | 'suggestionPageUp' | 'suggestionPageDown' | 'suggestionHome' | 'suggestionEnd' | 'escape' };

export const HandleFormulaBarKeyCommand = defineSheetCommand<SheetFormulaBarKeyInput>('cellEditor.formulaBar.key');
