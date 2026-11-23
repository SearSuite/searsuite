import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';
/** Stable checkbox diagnostic codes. */
export const CheckboxErrorCode = {
  Invalid: 'CHECKBOX_INVALID',
  Conflict: 'CHECKBOX_CONTENT_CONFLICT',
  Limit: 'CHECKBOX_RANGE_LIMIT',
} as const;
/** One checkbox diagnostic identity. */
export type CheckboxErrorCode = (typeof CheckboxErrorCode)[keyof typeof CheckboxErrorCode];
/** Checkbox-specific public error with structured context. */
export class CheckboxError extends SearError {
  /** Creates a feature diagnostic. */ public constructor(
    public override readonly code: CheckboxErrorCode,
    message: string,
    details: SearErrorDetails = {},
  ) {
    super(message, details);
  }
}
