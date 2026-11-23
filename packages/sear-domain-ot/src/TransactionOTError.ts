import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable errors raised by transaction OT definitions and registries. */
export const TransactionOTErrorCode = {
  InvalidDefinition: 'SEAR_TRANSACTION_OT_INVALID_DEFINITION',
  InvalidPayload: 'SEAR_TRANSACTION_OT_INVALID_PAYLOAD',
  TypeConflict: 'SEAR_TRANSACTION_OT_TYPE_CONFLICT',
  TypeNotRegistered: 'SEAR_TRANSACTION_OT_TYPE_NOT_REGISTERED',
  RelationConflict: 'SEAR_TRANSACTION_OT_RELATION_CONFLICT',
  RelationNotRegistered: 'SEAR_TRANSACTION_OT_RELATION_NOT_REGISTERED',
  InvertUnsupported: 'SEAR_TRANSACTION_OT_INVERT_UNSUPPORTED',
  RegistryDestroyed: 'SEAR_TRANSACTION_OT_REGISTRY_DESTROYED',
} as const;

export type TransactionOTErrorCode = (typeof TransactionOTErrorCode)[keyof typeof TransactionOTErrorCode];

/** Public error for invalid or unavailable transaction OT behavior. */
export class TransactionOTError extends SearError {
  public override readonly code: TransactionOTErrorCode;

  public constructor(code: TransactionOTErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
