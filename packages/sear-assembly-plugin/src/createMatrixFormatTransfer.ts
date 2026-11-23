import { clearMatrixFormats } from './clearMatrixFormats';
import { createUpdateCellOTOperation, type Operation } from '@searsuite/sear-domain-ot';
import { type PluginKey } from './PluginKey';
import { type SheetFormatTransferContribution } from './SheetFormatTransfer';

interface MatrixFormatCapture<Value> {
  readonly width: number;
  readonly height: number;
  readonly values: readonly (readonly [number, Value])[];
}

/** Sparse read contract implemented by feature-owned matrices. */
export interface SheetFormatMatrix<Value> {
  getDefaultValue?(): Value | null | undefined;
  getItem(row: number, column: number): Value | null | undefined;
  forEachStoredInRange(
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
    visit: (value: Value, row: number, column: number) => void,
  ): void;
}

/** Captures sparse persisted formats and tiles them over an inclusive target. */
export function createMatrixFormatTransfer<Value>(
  id: string,
  target: PluginKey,
  readMatrix: () => SheetFormatMatrix<Value>,
): Required<Omit<SheetFormatTransferContribution, 'singleCellFillStep'>> {
  return {
    id,
    usedExtent(lastRow, lastColumn) {
      let row = -1;
      let column = -1;
      readMatrix().forEachStoredInRange(0, 0, lastRow, lastColumn, (value, currentRow, currentColumn) => {
        if (value == null) return;
        row = Math.max(row, currentRow);
        column = Math.max(column, currentColumn);
      });
      return row < 0 ? null : [row, column];
    },
    clear: (range) => clearMatrixFormats(target, readMatrix(), range),
    planCaptured: (portable, destination) => planCapturedMatrixFormat(
      target, readMatrix(), portable as MatrixFormatCapture<Value>, destination,
    ),
    capture(source) {
      const height = source.end[0] - source.start[0] + 1;
      const width = source.end[1] - source.start[1] + 1;
      const values = new Map<number, Value>();
      readMatrix().forEachStoredInRange(...source.start, ...source.end, (value, row, column) => {
        if (value != null) values.set((row - source.start[0]) * width + column - source.start[1], clone(value));
      });
      const portable: MatrixFormatCapture<Value> = { width, height, values: [...values] };
      return { portable, plan: (destination) => planCapturedMatrixFormat(target, readMatrix(), portable, destination) };
    },
  };
}

function planCapturedMatrixFormat<Value>(
  target: PluginKey,
  matrix: SheetFormatMatrix<Value>,
  { width, height, values: entries }: MatrixFormatCapture<Value>,
  destination: Parameters<NonNullable<SheetFormatTransferContribution['capture']>>[0],
) {
  const values = new Map(entries);
  const operations: Operation[] = [];
  const defaultValue = matrix.getDefaultValue?.() ?? null;
  const append = (row: number, column: number, value: Value | null) => {
    const stored = matrix.getItem(row, column) ?? null;
    const previous = JSON.stringify(stored) === JSON.stringify(defaultValue) ? null : stored;
    if (JSON.stringify(value) !== JSON.stringify(previous)) {
      operations.push(createUpdateCellOTOperation([row, column], clone(value), clone(previous)));
    }
  };
  // Clearing a default source visits only explicit target entries, even for whole-axis ranges.
  if (!values.size) return clearMatrixFormats(target, matrix, destination);
  for (let row = destination.start[0]; row <= destination.end[0]; row += 1) {
    for (let column = destination.start[1]; column <= destination.end[1]; column += 1) {
      const key = ((row - destination.start[0]) % height) * width + ((column - destination.start[1]) % width);
      append(row, column, values.get(key) ?? null);
    }
  }
  return operations.length ? [{ target, operations }] : [];
}

function clone<Value>(value: Value): Value {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as Value);
}
