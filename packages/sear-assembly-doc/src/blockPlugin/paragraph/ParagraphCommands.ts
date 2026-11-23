import { defineDocCommand } from '@searsuite/sear-assembly-commands';
import { type RichTextLineSpacing } from '@searsuite/sear-domain-doc';

/** Input accepted by SetDocLineSpacingCommand. Null clears the paragraph override. */
export interface SetDocLineSpacingInput {
  readonly lineSpacing: RichTextLineSpacing | null;
}

/** Input accepted by SetDocParagraphSpacingAfterCommand. Null clears the paragraph override. */
export interface SetDocParagraphSpacingAfterInput {
  readonly spacingAfter: number | null;
}

/** Sets or clears line-spacing overrides on the selected paragraphs. */
export const SetDocLineSpacingCommand = defineDocCommand<SetDocLineSpacingInput>('doc.setLineSpacing');

/** Sets or clears after-spacing overrides on the selected paragraphs. */
export const SetDocParagraphSpacingAfterCommand =
  defineDocCommand<SetDocParagraphSpacingAfterInput>('doc.setParagraphSpacingAfter');
