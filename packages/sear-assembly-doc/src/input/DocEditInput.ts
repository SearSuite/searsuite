/** A position in the rich document represented by a node path and text offset. */
export interface SheetTextPosition {
  readonly path: readonly (number | string)[];
  readonly offset: number;
}

/** A text selection represented by anchor and head positions. */
export interface SheetTextSelection {
  readonly anchor: SheetTextPosition;
  readonly head: SheetTextPosition;
}

/** Modifier keys normalized by the Sheet host. */
export interface SheetInputModifiers {
  readonly shiftKey?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
}

/** Text insertion delivered by the Sheet input adapter. */
export interface SheetTextInput {
  readonly type: 'insertText';
  readonly text: string;
}

/** Text deletion delivered by the Sheet input adapter. */
export interface SheetDeleteInput {
  readonly type: 'deleteContent';
  readonly direction: 'backward' | 'forward';
  readonly count?: number | undefined;
}

/** IME composition lifecycle input delivered by the Sheet input adapter. */
export interface SheetCompositionInput {
  readonly type: 'compositionStart' | 'compositionUpdate' | 'compositionEnd';
  readonly text?: string | undefined;
}

/** Keyboard input that the embedded editor may consume for navigation or editing. */
export interface SheetKeyInput extends SheetInputModifiers {
  readonly type: 'keyDown';
  readonly key: string;
  readonly code?: string | undefined;
}

/** Input accepted by an active Sheet edit session. */
export type SheetEditInput = SheetTextInput | SheetDeleteInput | SheetCompositionInput | SheetKeyInput;

/** An inline style patch applied to the active text selection. */
export interface SheetInlineStyleUpdate {
  readonly attrs: Readonly<Record<string, unknown>>;
}
