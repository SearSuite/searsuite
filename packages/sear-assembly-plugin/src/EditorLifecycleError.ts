import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable machine-readable errors raised by editor lifecycle stacks. */
export const EditorLifecycleErrorCode = {
  StackDisposed: 'SEAR_EDITOR_LIFECYCLE_STACK_DISPOSED',
  MultipleDisposalFailures: 'SEAR_EDITOR_LIFECYCLE_MULTIPLE_DISPOSAL_FAILURES',
} as const;

export type EditorLifecycleErrorCode = (typeof EditorLifecycleErrorCode)[keyof typeof EditorLifecycleErrorCode];

/** Public error raised when lifecycle stack ownership is violated. */
export class EditorLifecycleError extends SearError {
  public override readonly code: EditorLifecycleErrorCode;

  public constructor(code: EditorLifecycleErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
