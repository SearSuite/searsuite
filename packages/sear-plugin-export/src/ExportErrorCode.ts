/** Stable machine-readable error codes owned by the export plugin. */
export const ExportErrorCode = {
  /** Two codecs attempted to own the same persisted module key. */
  duplicateCodec: 'SEAR_EXPORT_DUPLICATE_CODEC',
  /** A persisted module could not be restored because its owner is not registered. */
  codecNotFound: 'SEAR_EXPORT_CODEC_NOT_FOUND',
  /** The persisted payload does not match the expected object shape. */
  invalidFormat: 'SEAR_EXPORT_INVALID_FORMAT',
} as const;

/** Machine-readable export error code type. */
export type ExportErrorCode = (typeof ExportErrorCode)[keyof typeof ExportErrorCode];
