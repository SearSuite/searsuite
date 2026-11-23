import { SearError } from '@searsuite/sear-foundation-error';
import { OTClone } from './BaseOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';

function cloneOTValue<T>(value: T): T {
  return value === void 0 ? value : (OTClone(value as Object) as T);
}

/** Builds the inverse operation for one matrix component. */
export function invertMatrixComponent<T>(operation: MatrixOTOperation<T>): MatrixOTOperation<T> {
  const path = [...operation.p];
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0)
    return { p: path, [MatrixOTActionName.RowDelete]: OTClone(operation.ri) };
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0)
    return { p: path, [MatrixOTActionName.RowInsert]: OTClone(operation.rd) };
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0)
    return { p: [...operation.rm], [MatrixOTActionName.RowMove]: path };
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0)
    return { p: path, [MatrixOTActionName.ColDelete]: OTClone(operation.ci) };
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0)
    return { p: path, [MatrixOTActionName.ColInsert]: OTClone(operation.cd) };
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
    return { p: [...operation.cm], [MatrixOTActionName.ColMove]: path };
  if (MatrixOTActionName.UpdateCell in operation && operation.uc !== void 0) {
    return {
      p: path,
      [MatrixOTActionName.UpdateCell]: {
        ...(operation.uc.intent ? { intent: operation.uc.intent } : {}),
        value: cloneOTValue(operation.uc.prev),
        prev: cloneOTValue(operation.uc.value),
      },
    };
  }
  if (MatrixOTActionName.ResizeRow in operation && operation.rr !== void 0)
    return { p: path, [MatrixOTActionName.ResizeRow]: { value: operation.rr.prev, prev: operation.rr.value } };
  if (MatrixOTActionName.ResizeCol in operation && operation.rc !== void 0)
    return { p: path, [MatrixOTActionName.ResizeCol]: { value: operation.rc.prev, prev: operation.rc.value } };
  throw new SearError('invalid / missing instruction in op');
}
