import { MatrixOTActionName, type MatrixOTOperation } from '@searsuite/sear-domain-ot';
import {
  FormulaStructureChangeActionNames,
  StructureChangeAxis,
  StructureChangeKind,
  getStructureChangeAxis,
  getStructureChangeKind,
  matrixOperationToStructureChange,
  matrixOperationsToStructureChanges,
  shiftStructureCoordinate,
} from '../src';

describe('FormulaStructureChange', () => {
  it('publishes the MatrixOT structure action surface used by formula rebasing', () => {
    expect(FormulaStructureChangeActionNames).toEqual([
      MatrixOTActionName.RowInsert,
      MatrixOTActionName.RowDelete,
      MatrixOTActionName.RowMove,
      MatrixOTActionName.ColInsert,
      MatrixOTActionName.ColDelete,
      MatrixOTActionName.ColMove,
    ]);
  });

  it('converts MatrixOT structure operations into formula structure changes', () => {
    const operations: MatrixOTOperation<unknown>[] = [
      { p: [1], [MatrixOTActionName.RowInsert]: [] },
      { p: [2], [MatrixOTActionName.RowDelete]: [] },
      { p: [3], [MatrixOTActionName.RowMove]: [5] },
      { p: [4], [MatrixOTActionName.ColInsert]: [] },
      { p: [5], [MatrixOTActionName.ColDelete]: [] },
      { p: [6], [MatrixOTActionName.ColMove]: [0] },
      { p: [7, 1], [MatrixOTActionName.UpdateCell]: { value: 'next', prev: 'prev' } },
    ];

    expect(matrixOperationsToStructureChanges(operations)).toEqual([
      { type: MatrixOTActionName.RowInsert, index: 1, count: 1 },
      { type: MatrixOTActionName.RowDelete, index: 2, count: 1 },
      { type: MatrixOTActionName.RowMove, fromIndex: 3, toIndex: 5 },
      { type: MatrixOTActionName.ColInsert, index: 4, count: 1 },
      { type: MatrixOTActionName.ColDelete, index: 5, count: 1 },
      { type: MatrixOTActionName.ColMove, fromIndex: 6, toIndex: 0 },
    ]);
    expect(
      matrixOperationToStructureChange({
        p: ['row'],
        [MatrixOTActionName.RowInsert]: [],
      } as unknown as MatrixOTOperation<unknown>),
    ).toBeNull();
  });

  it('exposes structure change axis and kind', () => {
    expect(getStructureChangeAxis({ type: MatrixOTActionName.RowInsert, index: 0, count: 1 })).toBe(
      StructureChangeAxis.Row,
    );
    expect(getStructureChangeAxis({ type: MatrixOTActionName.ColDelete, index: 0, count: 1 })).toBe(
      StructureChangeAxis.Col,
    );
    expect(getStructureChangeKind({ type: MatrixOTActionName.RowInsert, index: 0, count: 1 })).toBe(
      StructureChangeKind.Insert,
    );
    expect(getStructureChangeKind({ type: MatrixOTActionName.ColDelete, index: 0, count: 1 })).toBe(
      StructureChangeKind.Delete,
    );
    expect(getStructureChangeKind({ type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 1 })).toBe(
      StructureChangeKind.Move,
    );
  });

  it('shifts coordinates through insert and delete changes', () => {
    expect(
      shiftStructureCoordinate({
        coordinate: 2,
        axis: StructureChangeAxis.Row,
        changes: [{ type: MatrixOTActionName.RowInsert, index: 1, count: 1 }],
      }),
    ).toEqual({ value: 3, deleted: false });
    expect(
      shiftStructureCoordinate({
        coordinate: 2,
        axis: StructureChangeAxis.Row,
        changes: [{ type: MatrixOTActionName.RowDelete, index: 2, count: 1 }],
      }),
    ).toEqual({ value: -1, deleted: true });
    expect(
      shiftStructureCoordinate({
        coordinate: 2,
        axis: StructureChangeAxis.Row,
        absolute: true,
        changes: [{ type: MatrixOTActionName.RowInsert, index: 1, count: 1 }],
      }),
    ).toEqual({ value: 2, deleted: false });
  });

  it('swaps move coordinates while leaving other and absolute coordinates unchanged', () => {
    const changes = [{ type: MatrixOTActionName.RowMove, fromIndex: 1, toIndex: 3 }] as const;
    expect(shiftStructureCoordinate({ coordinate: 1, axis: StructureChangeAxis.Row, changes })).toEqual({
      value: 3,
      deleted: false,
    });
    expect(shiftStructureCoordinate({ coordinate: 3, axis: StructureChangeAxis.Row, changes })).toEqual({
      value: 1,
      deleted: false,
    });
    expect(shiftStructureCoordinate({ coordinate: 2, axis: StructureChangeAxis.Row, changes })).toEqual({
      value: 2,
      deleted: false,
    });
    expect(shiftStructureCoordinate({ coordinate: 1, axis: StructureChangeAxis.Row, changes, absolute: true })).toEqual(
      { value: 1, deleted: false },
    );
  });
});
