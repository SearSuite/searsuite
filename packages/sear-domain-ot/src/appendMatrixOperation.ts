import { OTClone } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';

/** Appends one matrix operation while collapsing adjacent mergeable edits. */
export function appendMatrixOperation<T>(destination: MatrixOTOperation<T>[], operation: MatrixOTOperation<T>): void {
  const current = OTClone(operation) as MatrixOTOperation<T>;
  if (destination.length === 0) {
    destination.push(current);
    return;
  }
  const last = destination[destination.length - 1];
  if (
    MatrixOTActionName.ColInsert in last &&
    last.ci !== void 0 &&
    MatrixOTActionName.ColDelete in current &&
    JSON.stringify(current.cd) === JSON.stringify(last.ci)
  ) {
    destination.pop();
  } else if (
    MatrixOTActionName.RowInsert in last &&
    last.ri !== void 0 &&
    MatrixOTActionName.RowDelete in current &&
    JSON.stringify(current.rd) === JSON.stringify(last.ri)
  ) {
    destination.pop();
  } else if (
    MatrixOTActionName.UpdateCell in last &&
    last.uc !== void 0 &&
    MatrixOTActionName.UpdateCell in current &&
    current.uc !== void 0 &&
    last.uc.intent === undefined &&
    current.uc.intent === undefined &&
    last.p.length === current.p.length &&
    last.p.every((value, index) => value === current.p[index])
  ) {
    last.uc = { prev: last.uc.prev, value: { ...last.uc.value, ...current.uc.value } as T };
  } else {
    destination.push(current);
  }
}
