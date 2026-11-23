import { assertSupportedStructureChange } from './assertSupportedStructureChange';
import { getStructureChangeAxis } from './getStructureChangeAxis';
import { getStructureChangeKind } from './getStructureChangeKind';
import { type ShiftedStructureCoordinate } from './ShiftedStructureCoordinate';
import { type StructureChange } from './StructureChange';
import { type StructureChangeAxis } from './StructureChangeAxis';
import { StructureChangeKind } from './StructureChangeKind';

/** Shifts one coordinate through formula structure changes. */
export function shiftStructureCoordinate(input: {
  readonly coordinate: number;
  readonly axis: StructureChangeAxis;
  readonly changes: readonly StructureChange[];
  readonly absolute?: boolean;
}): ShiftedStructureCoordinate {
  if (input.absolute) return { value: input.coordinate, deleted: false };
  let value = input.coordinate;
  for (const change of input.changes) {
    if (getStructureChangeAxis(change) !== input.axis) continue;
    assertSupportedStructureChange(change);
    const kind = getStructureChangeKind(change);
    if (kind === StructureChangeKind.Move) {
      const move = change as Extract<StructureChange, { fromIndex: number }>;
      if (value === move.fromIndex) value = move.toIndex;
      else if (value === move.toIndex) value = move.fromIndex;
    } else {
      const interval = change as Extract<StructureChange, { index: number }>;
      if (kind === StructureChangeKind.Insert && value >= interval.index) value += interval.count;
      else if (kind === StructureChangeKind.Delete && value >= interval.index + interval.count) value -= interval.count;
      else if (kind === StructureChangeKind.Delete && value >= interval.index) return { value: -1, deleted: true };
    }
  }
  return { value, deleted: false };
}
