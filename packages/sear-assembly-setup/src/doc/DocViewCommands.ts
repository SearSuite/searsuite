import { defineDocCommand } from '@searsuite/sear-assembly-commands';

/** Requests presentation work without changing document state. */
export const RenderDocCommand = defineDocCommand<void>('doc.render');
