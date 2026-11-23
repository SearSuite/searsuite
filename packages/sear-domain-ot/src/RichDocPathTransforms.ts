import { type RichDocOTOperation, type RichDocOTOperationPath } from './RichDocOTOperations';

export function adjustPathForNodeInsert(
  operation: RichDocOTOperation,
  insertedPath: RichDocOTOperationPath,
  insertedIndex: number,
): RichDocOTOperation {
  const parentLength = insertedPath.length - 1;
  if (operation.p.length <= parentLength) return operation;
  for (let index = 0; index < parentLength; index++) if (operation.p[index] !== insertedPath[index]) return operation;
  const operationIndex = operation.p[parentLength];
  if (typeof operationIndex !== 'number') return operation;
  if (operationIndex >= insertedIndex) {
    const path = [...operation.p];
    path[parentLength] = operationIndex + 1;
    operation.p = path;
  }
  return operation;
}

export function adjustPathForNodeDelete(
  operation: RichDocOTOperation,
  deletedPath: RichDocOTOperationPath,
  deletedIndex: number,
): RichDocOTOperation | null {
  const parentLength = deletedPath.length - 1;
  if (operation.p.length <= parentLength) return operation;
  for (let index = 0; index < parentLength; index++) if (operation.p[index] !== deletedPath[index]) return operation;
  const operationIndex = operation.p[parentLength];
  if (typeof operationIndex !== 'number') return operation;
  if (operationIndex === deletedIndex && operation.p.length > deletedPath.length) return null;
  if (operationIndex > deletedIndex) {
    const path = [...operation.p];
    path[parentLength] = operationIndex - 1;
    operation.p = path;
  }
  return operation;
}

export function transformIndexForMove(index: number, from: number, to: number): number {
  if (from === to || index === from) return from === to ? index : to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}
