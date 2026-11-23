/** Canonical kinds of portable text-input events. */
export const TextInputKind = {
  Text: 'text',
  CompositionUpdate: 'compositionUpdate',
} as const;

/** Committed text or an in-flight composition update, including composition clearing. */
export type TextInputEvent =
  | { readonly kind: typeof TextInputKind.Text; readonly text: string }
  | {
      readonly kind: typeof TextInputKind.CompositionUpdate;
      readonly text: string;
      readonly caretOffset: number;
    };

/** Portable text and selection-deletion subscriptions. */
export interface TextInputHandlers {
  /** Receives committed text and composition updates through one ordered stream. */
  onTextInput?: (event: TextInputEvent) => void;
  /** Receives a clipboard cut as deletion of the current selection. */
  onDelete?: () => void;
  /** Supplies selected text for a host-native cut event. */
  onCut?: () => string | null;
  /** Returns true when a host handles a native paste as a committed grid operation. */
  onPaste?: (text: string) => boolean;
}
