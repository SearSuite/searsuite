import { SheetClipboardError, SheetClipboardErrorCode } from './SheetClipboardErrors';
import type { SheetClipboardCellPoint, SheetClipboardDataSource } from './SheetClipboardContracts';
import type { SheetClipboardRangeInput } from './SheetClipboardCommands';

export function resolveRange(input: SheetClipboardRangeInput | undefined, source: SheetClipboardDataSource): SheetClipboardRangeInput {
  const range = input ?? source.getSelection();
  if (!range) throw new SheetClipboardError(SheetClipboardErrorCode.NoSelection, 'Clipboard command requires a sheet selection.');
  const start = normalizePoint(range.start, 'clipboard range start');
  const end = normalizePoint(range.end, 'clipboard range end');
  const normalized = {
    start: [Math.min(start[0], end[0]), Math.min(start[1], end[1])] as [number, number],
    end: [Math.max(start[0], end[0]), Math.max(start[1], end[1])] as [number, number],
  };
  assertPointInBounds(normalized.start, source, 'clipboard range start');
  assertPointInBounds(normalized.end, source, 'clipboard range end');
  return normalized;
}

export function resolvePasteTarget(input: SheetClipboardCellPoint | undefined, source: SheetClipboardDataSource): [number, number] {
  if (input) {
    const target = normalizePoint(input, 'clipboard paste target');
    assertPointInBounds(target, source, 'clipboard paste target');
    return target;
  }
  const selection = source.getSelection();
  if (!selection) throw new SheetClipboardError(SheetClipboardErrorCode.NoSelection, 'Paste command requires a target selection.');
  const range = resolveRange(selection, source);
  return [range.start[0], range.start[1]];
}

function normalizePoint(point: SheetClipboardCellPoint, label: string): [number, number] {
  if (!Array.isArray(point) || point.length !== 2 || !Number.isInteger(point[0]) || !Number.isInteger(point[1])) {
    throw new SheetClipboardError(SheetClipboardErrorCode.InvalidPayload, `${label} must contain integer coordinates.`);
  }
  return [point[0], point[1]];
}

function assertPointInBounds(point: [number, number], source: SheetClipboardDataSource, label: string): void {
  if (point[0] < 0 || point[1] < 0 || point[0] >= source.getRowCount() || point[1] >= source.getColumnCount()) {
    throw new SheetClipboardError(SheetClipboardErrorCode.TargetOutOfBounds, `${label} is outside sheet bounds.`, { point });
  }
}
