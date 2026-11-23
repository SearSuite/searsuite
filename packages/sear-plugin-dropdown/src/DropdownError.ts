import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';
/** Stable dropdown diagnostic codes. */
export const DropdownErrorCode = {
  Invalid: 'DROPDOWN_INVALID',
  Stale: 'DROPDOWN_STALE',
  Limit: 'DROPDOWN_LIMIT',
  Conflict: 'DROPDOWN_CONFLICT',
} as const;
/** One public dropdown error code. */
export type DropdownErrorCode = (typeof DropdownErrorCode)[keyof typeof DropdownErrorCode];
/** Structured feature diagnostic. */
export class DropdownError extends SearError {
  /** Creates a public dropdown diagnostic. */
  constructor(public override readonly code: DropdownErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
  }
}
