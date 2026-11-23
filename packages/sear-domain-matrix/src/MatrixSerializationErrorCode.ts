/** Stable machine-readable error codes owned by matrix serialization helpers. */
export const MatrixSerializationErrorCode = {
  /** The persisted matrix payload does not match the expected shape. */
  invalidFormat: 'SEAR_MATRIX_SERIALIZATION_INVALID_FORMAT',
} as const;

/** Machine-readable matrix serialization error code type. */
export type MatrixSerializationErrorCode =
  (typeof MatrixSerializationErrorCode)[keyof typeof MatrixSerializationErrorCode];
