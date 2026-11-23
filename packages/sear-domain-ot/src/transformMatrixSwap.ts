import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { OTTransformPriority } from './BaseOT';
import { createMoveRowOTOperation } from './createMoveRowOTOperation';
import { createMoveColOTOperation } from './createMoveColOTOperation';

function swapOf<T>(operation: MatrixOTOperation<T>) {
  if (operation.p.length !== 1) return null;
  if (MatrixOTActionName.RowMove in operation) return { axis: 0 as const, from: operation.p[0], to: operation.rm[0] };
  if (MatrixOTActionName.ColMove in operation) return { axis: 1 as const, from: operation.p[0], to: operation.cm[0] };
  return null;
}

function structuralAxis<T>(operation: MatrixOTOperation<T>): 0 | 1 | null {
  if (
    MatrixOTActionName.RowInsert in operation ||
    MatrixOTActionName.RowDelete in operation ||
    MatrixOTActionName.ResizeRow in operation
  )
    return 0;
  if (
    MatrixOTActionName.ColInsert in operation ||
    MatrixOTActionName.ColDelete in operation ||
    MatrixOTActionName.ResizeCol in operation
  )
    return 1;
  return null;
}

/** Root matrix swaps use permutation algebra, not list remove/insert rebasing. */
export function transformMatrixSwap<T>(
  current: MatrixOTOperation<T>,
  other: MatrixOTOperation<T>,
  priority: OTTransformPriority,
): MatrixOTOperation<T>[] | null {
  const own = swapOf(current);
  const concurrent = swapOf(other);
  if (!own && !concurrent) return null;
  const mapped = (index: number, swap: NonNullable<typeof own>) =>
    index === swap.from ? swap.to : index === swap.to ? swap.from : index;
  const makeSwap = (axis: 0 | 1, from: number, to: number): MatrixOTOperation<T> =>
    (axis === 0
      ? createMoveRowOTOperation([from], [to])
      : createMoveColOTOperation([from], [to])) as MatrixOTOperation<T>;
  if (own && concurrent) {
    if (own.axis !== concurrent.axis || concurrent.from === concurrent.to || own.from === own.to) return [current];
    if (
      (own.from === concurrent.from && own.to === concurrent.to) ||
      (own.from === concurrent.to && own.to === concurrent.from)
    )
      return [];
    return priority === OTTransformPriority.LEFT
      ? [makeSwap(own.axis, mapped(own.from, concurrent), mapped(own.to, concurrent))]
      : [current];
  }
  if (concurrent) {
    if (MatrixOTActionName.UpdateCell in current && current.p.length === 2) {
      current.p[concurrent.axis] = mapped(current.p[concurrent.axis], concurrent);
      return [current];
    }
    if (current.p.length !== 1) return null;
    const axis = structuralAxis(current);
    if (axis === null) return null;
    if (axis !== concurrent.axis) {
      const payload =
        MatrixOTActionName.RowInsert in current
          ? current.ri
          : MatrixOTActionName.RowDelete in current
          ? current.rd
          : MatrixOTActionName.ColInsert in current
          ? current.ci
          : MatrixOTActionName.ColDelete in current
          ? current.cd
          : null;
      if (payload)
        [payload[concurrent.from], payload[concurrent.to]] = [payload[concurrent.to], payload[concurrent.from]];
    } else if (!(MatrixOTActionName.RowInsert in current || MatrixOTActionName.ColInsert in current)) {
      current.p[0] = mapped(current.p[0], concurrent);
    }
    return [current];
  }
  if (!own || other.p.length !== 1) return null;
  const axis = structuralAxis(other);
  if (axis === null) return null;
  if (axis !== own.axis) return [current];
  const index = other.p[0];
  if (MatrixOTActionName.RowInsert in other || MatrixOTActionName.ColInsert in other) {
    return [makeSwap(own.axis, own.from + (index <= own.from ? 1 : 0), own.to + (index <= own.to ? 1 : 0))];
  }
  if (MatrixOTActionName.RowDelete in other || MatrixOTActionName.ColDelete in other) {
    if (own.from === own.to)
      return [makeSwap(own.axis, own.from - (index < own.from ? 1 : 0), own.to - (index < own.to ? 1 : 0))];
    if (index !== own.from && index !== own.to)
      return [makeSwap(own.axis, own.from - (index < own.from ? 1 : 0), own.to - (index < own.to ? 1 : 0))];
    const surviving = index === own.from ? own.to : own.from;
    const from = surviving - (index < surviving ? 1 : 0);
    const to = index - (surviving < index ? 1 : 0);
    const result: MatrixOTOperation<T>[] = [];
    const direction = from < to ? 1 : -1;
    for (let position = from; position !== to; position += direction)
      result.push(makeSwap(own.axis, position, position + direction));
    return result;
  }
  return [current];
}
