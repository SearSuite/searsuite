import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  MatrixOT,
  createInsertRowOTOperation,
  createDeleteColOTOperation,
  createMoveRowOTOperation,
  createMoveColOTOperation,
} from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import {
  CellBorderMatrix,
  CellBorderError,
  SheetCellBorderPlugin,
  SheetBorderPreset,
  SheetBorderLineStyle,
  SetRangeCellBorderCommand,
  ReadSheetCellBorderQuery,
  type SheetBorderStroke,
} from '../src';
import { planCellBorders } from '../src/CellBorderPlanning';
import { normalizeBorderRange } from '../src/CellBorderRange';

const stroke: SheetBorderStroke = { color: '#ff0000', style: SheetBorderLineStyle.Thin };

describe('Cell borders', () => {
  it.each([
    [SheetBorderPreset.All, 17],
    [SheetBorderPreset.Outside, 10],
    [SheetBorderPreset.Inside, 7],
    [SheetBorderPreset.Horizontal, 3],
    [SheetBorderPreset.Vertical, 4],
    [SheetBorderPreset.Top, 3],
    [SheetBorderPreset.Bottom, 3],
    [SheetBorderPreset.Left, 2],
    [SheetBorderPreset.Right, 2],
    [SheetBorderPreset.None, 0],
  ])('applies %s with %s unique edges on a reversed 2x3 range', (preset, count) => {
    const matrix = new CellBorderMatrix(void 0, [4, 5]);
    const range = normalizeBorderRange({ anchor: [2, 3], focus: [1, 1] }, matrix.shape);
    MatrixOT.apply(matrix, planCellBorders(matrix, range, preset, stroke));
    let edges = 0;
    matrix.forEachStored((value) => {
      edges += Object.keys(value ?? {}).length;
    });
    expect(edges).toBe(count);
    expect(planCellBorders(matrix, range, preset, stroke)).toEqual([]);
  });

  it('keeps sparse defaults and isolates reads, writes and clones', () => {
    const matrix = new CellBorderMatrix(void 0, [2, 2]);
    const mutable = { top: { ...stroke } };
    matrix.setItem(0, 0, mutable);
    mutable.top.color = '#000000';
    const read = matrix.getItem(0, 0)!;
    (read.top as { color: string }).color = '#123456';
    expect(matrix.getItem(0, 0)).toEqual({ top: stroke });
    const clone = matrix.clone();
    clone.setItem(0, 0, null);
    expect(matrix.getItem(0, 0)).toEqual({ top: stroke });
    matrix.setItem(0, 0, {});
    expect(
      matrix
        .toArray()
        .flat()
        .every((value) => value === null),
    ).toBe(true);
    expect(() => matrix.setItem(0, 0, { top: { color: 'red', style: SheetBorderLineStyle.Thin } })).toThrow(
      CellBorderError,
    );
    expect(() => matrix.setItem(0, 0, { diagonal: stroke } as never)).toThrow(CellBorderError);
    expect(() => matrix.setItem(0, 0, { top: { color: '#000', style: 'future' } } as never)).toThrow(CellBorderError);
  });

  it('replaces the opposing neighbor edge and clears it atomically with no-border', () => {
    const matrix = new CellBorderMatrix(void 0, [3, 3]);
    matrix.setItem(0, 1, { bottom: { color: '#000000', style: SheetBorderLineStyle.Thick } });
    const range = { start: [1, 1] as [number, number], end: [1, 1] as [number, number] };
    const operations = planCellBorders(matrix, range, SheetBorderPreset.Top, stroke);
    expect(operations).toHaveLength(2);
    expect(operations[0].uc.prev).toEqual({ bottom: { color: '#000000', style: SheetBorderLineStyle.Thick } });
    MatrixOT.apply(matrix, operations);
    expect(matrix.getItem(0, 1)).toBeNull();
    expect(matrix.getItem(1, 1)).toEqual({ top: stroke });
    MatrixOT.apply(matrix, planCellBorders(matrix, range, SheetBorderPreset.None, stroke));
    expect(
      matrix
        .toArray()
        .flat()
        .every((value) => value === null),
    ).toBe(true);
  });

  it.each([
    [
      [-1, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [2, 0],
    ],
    [
      [0.5, 0],
      [0, 0],
    ],
  ])('rejects invalid ranges %s %s', (anchor, focus) => {
    expect(() =>
      normalizeBorderRange({ anchor: anchor as [number, number], focus: focus as [number, number] }, [2, 2]),
    ).toThrow(CellBorderError);
  });

  it('registers commands and queries and round-trips the owner codec', () => {
    const matrix = new CellBorderMatrix(void 0, [2, 2]);
    matrix.setItem(1, 1, { right: stroke });
    const plugin = new SheetCellBorderPlugin({ cellBorders: matrix });
    const commands = new SheetCommandBus();
    const queries = new SheetQueryRegistry();
    plugin.registerCommands(commands);
    plugin.registerQueries(queries);
    expect(commands.has(SetRangeCellBorderCommand)).toBe(true);
    expect(queries.run(ReadSheetCellBorderQuery, { row: 1, column: 1 })).toEqual({ right: stroke });
    const codec = SheetCellBorderPlugin.documentState.codec!;
    expect(codec.serialize({})).toBeUndefined();
    const restored = codec.deserialize(codec.serialize(plugin.getState()), 'border');
    expect(restored.cellBorders?.getItem(1, 1)).toEqual({ right: stroke });
    expect(restored.cellBorders?.shape).toEqual([2, 2]);
    expect(plugin.transactionOT.collaborative).toBe(true);
  });

  it('projects inserts, deletes and row/column swaps into its independent matrix', () => {
    const matrix = new CellBorderMatrix(void 0, [3, 3]);
    matrix.setItem(0, 0, { top: stroke });
    const plugin = new SheetCellBorderPlugin({ cellBorders: matrix });
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([
      createMoveRowOTOperation([0], [2]),
      createMoveColOTOperation([0], [2]),
      createInsertRowOTOperation([0], []),
      createDeleteColOTOperation([0], []),
    ]);
    plugin.apply(plugin.getState(), transaction);
    expect(matrix.shape).toEqual([4, 2]);
    expect(matrix.getItem(3, 1)).toEqual({ top: stroke });
  });
});
