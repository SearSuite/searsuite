import { SearError } from '@searsuite/sear-foundation-error';
import { type StructureChange } from './StructureChange';
import { StructureChangeKind } from './StructureChangeKind';
import { getStructureChangeKind } from './getStructureChangeKind';

/** Validates indices on a formula structure change before rebasing. */
export function assertSupportedStructureChange(change: StructureChange): void {
  const indices =
    getStructureChangeKind(change) === StructureChangeKind.Move
      ? [
          (change as Extract<StructureChange, { fromIndex: number }>).fromIndex,
          (change as Extract<StructureChange, { toIndex: number }>).toIndex,
        ]
      : [(change as Extract<StructureChange, { index: number }>).index];
  if (indices.every((index) => Number.isInteger(index) && index >= 0)) return;
  throw new SearError('[Formula] Structure change indices must be non-negative integers.');
}
