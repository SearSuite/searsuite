import { CSRMatrix } from './CSRMatrix';
import { MatrixSerializationError } from './MatrixSerializationError';
import { MatrixSerializationErrorCode } from './MatrixSerializationErrorCode';

/** Sparse matrix entry stored independently from the runtime CSR implementation. */
export interface SerializedSparseMatrixEntry<TValue = unknown> {
  /** Zero-based row coordinate. */
  readonly row: number;
  /** Zero-based column coordinate. */
  readonly col: number;
  /** Persisted value at the coordinate. */
  readonly value: TValue;
}

/** Sparse matrix payload used by package-level serializers. */
export interface SerializedSparseMatrix<TValue = unknown> {
  /** Matrix shape as `[rows, columns]`. */
  readonly shape: readonly [number, number];
  /** Optional sparse fallback value returned by the runtime matrix for absent entries. */
  readonly defaultValue?: TValue;
  /** Stored non-default entries. */
  readonly entries: readonly SerializedSparseMatrixEntry<TValue>[];
}

type RuntimeSparseMatrix<TValue> = Pick<
  CSRMatrix<TValue>,
  'shape' | 'getDefaultValue' | 'forEachStored' | 'setDefaultValue' | 'addItem'
>;

type SparseMatrixFactory<TMatrix, TValue> = new (
  data?: { data: TValue[]; indices: number[]; indptr: number[] },
  shape?: [number, number],
) => TMatrix;

/** Serializes a sparse runtime matrix without depending on CSR internals. */
export function serializeSparseMatrix<TValue>(matrix: RuntimeSparseMatrix<TValue>): SerializedSparseMatrix<TValue> {
  const entries: SerializedSparseMatrixEntry<TValue>[] = [];
  matrix.forEachStored((value: TValue, row: number, col: number) => {
    entries.push({ row, col, value: cloneSerializableValue(value) });
  });
  const defaultValue = matrix.getDefaultValue();
  return {
    shape: readMatrixShape(matrix.shape, 'shape'),
    ...(defaultValue === void 0 ? {} : { defaultValue: cloneSerializableValue(defaultValue) }),
    entries,
  };
}

/** Deserializes a generic sparse matrix payload into the requested runtime matrix class. */
export function deserializeSparseMatrix<TValue, TMatrix extends RuntimeSparseMatrix<TValue>>(
  payload: unknown,
  MatrixClass: SparseMatrixFactory<TMatrix, TValue>,
  path: string,
): TMatrix {
  const file = readSparseMatrixPayload<TValue>(payload, path);
  const matrix = new MatrixClass(void 0, [...file.shape]);
  if (file.defaultValue !== void 0) matrix.setDefaultValue(file.defaultValue);
  file.entries.forEach((entry, index) => {
    assertCoordinateInShape(entry.row, entry.col, file.shape, `${path}.entries[${index}]`);
    matrix.addItem(entry.row, entry.col, entry.value);
  });
  return matrix;
}

function readSparseMatrixPayload<TValue>(payload: unknown, path: string): SerializedSparseMatrix<TValue> {
  const record = readRecord(payload, path);
  const shape = readMatrixShape(record['shape'], `${path}.shape`);
  const rawEntries = record['entries'];
  if (!Array.isArray(rawEntries)) {
    throw new MatrixSerializationError(
      MatrixSerializationErrorCode.invalidFormat,
      'Sparse matrix entries must be an array.',
      { path: `${path}.entries` },
    );
  }
  const entries = rawEntries.map((entry, index) => readSparseMatrixEntry<TValue>(entry, `${path}.entries[${index}]`));
  const defaultValue = record['defaultValue'];
  const result: SerializedSparseMatrix<TValue> = { shape, entries };
  if (defaultValue !== void 0) return { ...result, defaultValue: cloneSerializableValue(defaultValue) as TValue };
  return result;
}

function readSparseMatrixEntry<TValue>(entry: unknown, path: string): SerializedSparseMatrixEntry<TValue> {
  const record = readRecord(entry, path);
  const row = record['row'];
  const col = record['col'];
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new MatrixSerializationError(
      MatrixSerializationErrorCode.invalidFormat,
      'Sparse matrix entry coordinates must be integers.',
      { path },
    );
  }
  return {
    row: row as number,
    col: col as number,
    value: cloneSerializableValue(record['value']) as TValue,
  };
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MatrixSerializationError(MatrixSerializationErrorCode.invalidFormat, 'Expected an object.', { path });
  }
  return value as Record<string, unknown>;
}

function readMatrixShape(value: unknown, path: string): [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isInteger(value[0]) ||
    !Number.isInteger(value[1]) ||
    value[0] < 0 ||
    value[1] < 0
  ) {
    throw new MatrixSerializationError(
      MatrixSerializationErrorCode.invalidFormat,
      'Matrix shape must be a non-negative integer pair.',
      { path },
    );
  }
  return [value[0], value[1]];
}

function assertCoordinateInShape(row: number, col: number, shape: readonly [number, number], path: string): void {
  if (row < 0 || col < 0 || row >= shape[0] || col >= shape[1]) {
    throw new MatrixSerializationError(
      MatrixSerializationErrorCode.invalidFormat,
      'Sparse matrix entry is outside the matrix shape.',
      { path, row, col, shape },
    );
  }
}

function cloneSerializableValue<TValue>(value: TValue): TValue {
  if (value === void 0) return value;
  return JSON.parse(JSON.stringify(value)) as TValue;
}
