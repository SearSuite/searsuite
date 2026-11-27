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
