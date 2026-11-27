import { type TextInputEvent } from '@searsuite/sear-domain-commands';
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
