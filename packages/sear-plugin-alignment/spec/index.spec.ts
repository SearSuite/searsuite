import {
  AlignmentMatrix,
  createSetRangeAlignmentOperations,
  SheetAlignmentPlugin,
  SheetHorizontalAlignment,
  SheetVerticalAlignment,
  SheetVerticalAlignmentPlugin,
  VerticalAlignmentMatrix,
} from '../src';
import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetMatrix } from '@searsuite/sear-render-engine';

describe('@searsuite/sear-plugin-alignment public API', () => {
  it('exports canonical alignment enums and matrices', () => {
    expect(AlignmentMatrix).toBeDefined();
    expect(VerticalAlignmentMatrix).toBeDefined();
    expect(SheetHorizontalAlignment).toEqual({ Left: 'left', Center: 'center', Right: 'right' });
    expect(SheetVerticalAlignment).toEqual({ Top: 'top', Center: 'center', Bottom: 'bottom' });
  });

  it('stores only non-left horizontal alignment overrides', () => {
    expect(new AlignmentMatrix().shape).toEqual([0, 0]);
    const alignments = new AlignmentMatrix(
      {
        data: [SheetHorizontalAlignment.Left, SheetHorizontalAlignment.Right],
        indices: [0, 1, 2],
        indptr: [0, 2],
      },
      [2, 3],
    );
    const stored: Array<[string, number, number]> = [];
    alignments.forEachStored((value, row, column) => stored.push([value, row, column]));
    expect(alignments.getItem(0, 0)).toBe(SheetHorizontalAlignment.Left);
    expect(stored).toEqual([[SheetHorizontalAlignment.Right, 1, 2]]);
    alignments.addItem(1, 2, SheetHorizontalAlignment.Left);
    alignments.addItem(0, 1, SheetHorizontalAlignment.Center);
    expect(alignments.getItem(1, 2)).toBe(SheetHorizontalAlignment.Left);
    expect(alignments.getItem(0, 1)).toBe(SheetHorizontalAlignment.Center);
    expect(() => alignments.addItem(0, 0, 'justify' as never)).toThrow(
      'Sheet alignment must be one of: left, center, right.',
    );
  });

  it('stores only non-center vertical alignment overrides', () => {
    const alignments = new VerticalAlignmentMatrix(
      {
        data: [SheetVerticalAlignment.Center, SheetVerticalAlignment.Bottom],
        indices: [0, 1, 2],
        indptr: [0, 2],
      },
      [2, 3],
    );
    const stored: Array<[string, number, number]> = [];
    alignments.forEachStored((value, row, column) => stored.push([value, row, column]));
    expect(alignments.getItem(0, 0)).toBe(SheetVerticalAlignment.Center);
    expect(stored).toEqual([[SheetVerticalAlignment.Bottom, 1, 2]]);
    alignments.addItem(1, 2, SheetVerticalAlignment.Center);
    alignments.addItem(0, 1, SheetVerticalAlignment.Center);
    expect(alignments.getItem(1, 2)).toBe(SheetVerticalAlignment.Center);
    expect(alignments.getItem(0, 1)).toBe(SheetVerticalAlignment.Center);
    expect(() => alignments.addItem(0, 0, 'middle' as never)).toThrow(
      'Sheet vertical alignment must be one of: top, center, bottom.',
    );
  });

  it('contributes horizontal and vertical properties through the visual reader registry', () => {
    const horizontal = new AlignmentMatrix(void 0, [2, 2]);
    horizontal.addItem(0, 1, SheetHorizontalAlignment.Right);
    const vertical = new VerticalAlignmentMatrix(void 0, [2, 2]);
    vertical.addItem(1, 0, SheetVerticalAlignment.Bottom);
    const registry = new SheetCellVisualReaderRegistry();
    const context = {
      readDefaultConfig: () => ({
        defaultCellAlign: SheetHorizontalAlignment.Center,
        defaultCellVerticalAlign: SheetVerticalAlignment.Top,
      }),
    };

    new SheetAlignmentPlugin({ cellAlignments: horizontal }).registerCellVisualReaders(registry, context);
    new SheetVerticalAlignmentPlugin({ cellVerticalAlignments: vertical }).registerCellVisualReaders(registry, context);

    expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({
      horizontalAlign: SheetHorizontalAlignment.Left,
      verticalAlign: SheetVerticalAlignment.Center,
    });
    expect(registry.read({ rowIndex: 0, columnIndex: 1 }).horizontalAlign).toBe(SheetHorizontalAlignment.Right);
    expect(registry.read({ rowIndex: 1, columnIndex: 0 }).verticalAlign).toBe(SheetVerticalAlignment.Bottom);
  });

  it('BUG-748 restores cell-type alignment when clearing explicit styles', () => {
    const cells = new SheetMatrix(void 0, [1, 4]);
    cells.addItem(0, 0, { type: 'number', value: 88 });
    cells.addItem(0, 1, { type: 'number', value: 99 });
    cells.addItem(0, 2, { type: 'number', value: 77 });
    cells.addItem(0, 3, { type: 'text', value: 'text' });
    const alignments = new AlignmentMatrix(void 0, [1, 4]);
    alignments.addItem(0, 0, SheetHorizontalAlignment.Right);
    alignments.addItem(0, 1, SheetHorizontalAlignment.Center);
    alignments.addItem(0, 3, SheetHorizontalAlignment.Right);
    const formats = new SheetFormatTransferRegistry();
    new SheetAlignmentPlugin({ cellAlignments: alignments }, () => cells).registerFormatTransfers(formats);

    const plans = formats.clear({ start: [0, 0], end: [0, 3] });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.operations).toEqual([
      { p: [0, 1], uc: { value: SheetHorizontalAlignment.Right, prev: SheetHorizontalAlignment.Center } },
      { p: [0, 3], uc: { value: null, prev: SheetHorizontalAlignment.Right } },
      { p: [0, 2], uc: { value: SheetHorizontalAlignment.Right, prev: null } },
    ]);
  });

  it('BUG-970 plans separate alignment ranges as one deduplicated operation list', () => {
    const readCellAlignment = jest.fn(() => null);
    const operations = createSetRangeAlignmentOperations(
      {
        alignment: SheetHorizontalAlignment.Center,
        ranges: [
          { anchor: [0, 1], focus: [0, 1] },
          { anchor: [0, 3], focus: [0, 3] },
          { anchor: [0, 1], focus: [0, 1] },
        ],
      },
      { getRowCount: () => 2, getColumnCount: () => 4, readCellAlignment },
    );
    expect(operations).toEqual([
      { p: [0, 1], uc: { value: SheetHorizontalAlignment.Center, prev: null } },
      { p: [0, 3], uc: { value: SheetHorizontalAlignment.Center, prev: null } },
    ]);
    expect(readCellAlignment).toHaveBeenCalledTimes(2);
  });
});
