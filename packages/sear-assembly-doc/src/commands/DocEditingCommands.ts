import { defineDocCommand } from '@searsuite/sear-assembly-commands';
import { DocCursorDirection } from '@searsuite/sear-domain-commands';
import { type DocSelection, type RichDocNode } from '@searsuite/sear-domain-doc';

/** Input accepted by LoadDocumentCommand. */
export interface LoadDocumentInput {
  /** Rich-document content to load into the document editor. */
  readonly document: RichDocNode[];
}

/** Input accepted by InsertDocTextCommand. */
export interface InsertDocTextInput {
  /** Text to insert at the current document selection. */
  readonly text: string;
}

/** Input accepted by MoveDocCursorCommand. */
export interface MoveDocCursorInput {
  /** Direction for cursor movement. */
  readonly direction: DocCursorDirection;
  /** Whether the movement should extend the current selection. */
  readonly shiftKey?: boolean;
}

/** Input accepted by SetDocSelectionCommand. */
export interface SetDocSelectionInput {
  /** Selection to make active in the document editor. */
  readonly selection: DocSelection;
}

/** Input accepted by SetDocCompositionCommand. */
export interface SetDocCompositionInput {
  /** Current composing text emitted by the host input method. */
  readonly text: string;
  /** Caret offset inside the composing text. */
  readonly caretOffset: number;
}

/** Replaces the active document content. */
export const LoadDocumentCommand = defineDocCommand<LoadDocumentInput>('doc.loadDocument');
/** Inserts text at the current document selection. */
export const InsertDocTextCommand = defineDocCommand<InsertDocTextInput>('doc.insertText');
/** Deletes content before the current document selection. */
export const DeleteDocBackwardCommand = defineDocCommand<void>('doc.deleteBackward');
/** Splits the current paragraph at the current document selection. */
export const SplitDocParagraphCommand = defineDocCommand<void>('doc.splitParagraph');
/** Moves the current document cursor. */
export const MoveDocCursorCommand = defineDocCommand<MoveDocCursorInput>('doc.moveCursor');
/** Selects all document content. */
export const SelectAllDocCommand = defineDocCommand<void>('doc.selectAll');
/** Sets the active document selection without changing content. */
export const SetDocSelectionCommand = defineDocCommand<SetDocSelectionInput>('doc.setSelection');
/** Requests a document render without changing content. */
export const RenderDocCommand = defineDocCommand<void>('doc.render');
/** Focuses the host text-input adapter for the document editor. */
export const FocusDocCommand = defineDocCommand<void>('doc.focus');
/** Sets the active IME composition preview text. */
export const SetDocCompositionCommand = defineDocCommand<SetDocCompositionInput>('doc.composition.set');
/** Clears the active IME composition preview text. */
export const ClearDocCompositionCommand = defineDocCommand<void>('doc.composition.clear');
