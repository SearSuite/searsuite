import { SheetAxisMoveBoundsError } from './SheetAxisMoveBoundsError';
import {
  createMoveRowOTOperation,
  createMoveColOTOperation,
  type MoveRowOTOperation,
  type MoveColOTOperation,
} from '@searsuite/sear-domain-ot';
import { type SheetMoveAxisInput } from './SheetMoveAxisInput';

/** Compiles a block rotation into the existing position-swap OT protocol in linear time. */
function swaps(input: SheetMoveAxisInput, size: number): [number, number][] {
  const { index, before } = input;
  const count = input.count ?? 1;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    !Number.isInteger(count) ||
    count < 1 ||
    index + count > size ||
    !Number.isInteger(before) ||
    before < 0 ||
    before > size
  ) {
    throw new SheetAxisMoveBoundsError(input, size);
  }
  if (before >= index && before <= index + count) return [];
  const start = Math.min(index, before);
  const end = Math.max(index + count, before);
  const length = end - start;
  const shift = before < index ? index - before : count;
  const current = Array.from({ length }, (_, i) => i);
  const positions = [...current];
  const result: [number, number][] = [];
  for (let i = 0; i < length; i++) {
    const wanted = (i + shift) % length;
    const other = positions[wanted];
    if (other === i) continue;
    const displaced = current[i];
    result.push([start + i, start + other]);
    current[other] = displaced;
    positions[displaced] = other;
    current[i] = wanted;
    positions[wanted] = i;
  }
  return result;
}

/** Creates row swaps implementing insertion at an original row boundary. */
export function createMoveRowsOperations(input: SheetMoveAxisInput, size: number): MoveRowOTOperation<unknown>[] {
  return swaps(input, size).map(([from, to]) => createMoveRowOTOperation([from], [to]));
}

/** Creates column swaps implementing insertion at an original column boundary. */
export function createMoveColumnsOperations(input: SheetMoveAxisInput, size: number): MoveColOTOperation<unknown>[] {
  return swaps(input, size).map(([from, to]) => createMoveColOTOperation([from], [to]));
}
