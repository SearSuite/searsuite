import { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  SheetClipboardTransferRegistry,
  SheetFormatTransferRegistry,
  SheetRangeMoveRegistry,
} from '@searsuite/sear-assembly-plugin';
import { SheetClipboardCutSession, SheetClipboardSheetIdentity } from '@searsuite/sear-plugin-clipboard';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey, SheetMatrix } from '@searsuite/sear-domain-sheet';
import { SheetDataEngine } from '@searsuite/sear-domain-sheet';
import { GetSelection } from '@searsuite/sear-plugin-selection';
import { CellMergeMatrix, SheetCellMergeFieldKey, SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';

import { DefaultSheetClipboardDataSource } from '@searsuite/sear-assembly-sheet-kernel';

describe('DefaultSheetClipboardDataSource', () => {
  it('projects selection, shape, values, empty cells, and missing state', () => {
    const data = new SheetDataEngine();
    const queries = new SheetQueryRegistry();
    const selection = { start: [1, 2], end: [3, 4] } as const;
    queries.register(GetSelection, () => selection);
    const source = new DefaultSheetClipboardDataSource(
      data,
      queries,
      new SheetFormatTransferRegistry(),
      new SheetClipboardTransferRegistry(),
      new HeadlessPlatform(),
      new SheetRangeMoveRegistry(),
      new SheetClipboardCutSession(),
      new SheetClipboardSheetIdentity('test-sheet'),
      new SheetCellInputValidationRegistry(),
    );

    expect(source.target).toBe(SheetDataPlugin.pluginKey);
    expect(source.getSelection()).toEqual(selection);
    expect(source.getRowCount()).toBe(0);
    expect(source.getColumnCount()).toBe(0);
    expect(source.readCell(0, 0)).toBeNull();

    const matrix = new SheetMatrix(undefined, [2, 3]);
    matrix.addItem(1, 2, { type: 'string', value: 'copied' });
    data.registerDataType(
      SheetDataPlugin.pluginKey,
      { sheetData: matrix },
      {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetDataMatrixFieldKey,
            select: (state: { sheetData: SheetMatrix }) => state.sheetData,
          },
        ],
      },
    );

    expect(source.getRowCount()).toBe(2);
    expect(source.getColumnCount()).toBe(3);
    expect(source.readCell(1, 2)).toEqual({ type: 'string', value: 'copied' });
    expect(source.readCell(0, 0)).toBeNull();
    expect(source.validatePasteCell(0, 0, { type: 'string', value: 'A'.repeat(32767) }).reject).toBe(false);
    expect(source.validatePasteCell(0, 0, { type: 'string', value: 'A'.repeat(32768) })).toMatchObject({
      reject: true,
      message: 'A cell can contain at most 32767 characters.',
    });
  });

  it('captures complete merges and plans owner operations for copy, paste, and cut', () => {
    const data = new SheetDataEngine();
    const merges = new CellMergeMatrix(void 0, [20, 20]);
    merges.setItem(15, 0, { endRow: 15, endColumn: 1 });
    data.registerDataType(
      SheetCellMergePlugin.pluginKey,
      { cellMerges: merges },
      {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetCellMergeFieldKey,
            select: (state: { cellMerges: CellMergeMatrix }) => state.cellMerges,
          },
        ],
      },
    );
    const source = new DefaultSheetClipboardDataSource(
      data,
      new SheetQueryRegistry(),
      new SheetFormatTransferRegistry(),
      new SheetClipboardTransferRegistry(),
      new HeadlessPlatform(),
      new SheetRangeMoveRegistry(),
      new SheetClipboardCutSession(),
      new SheetClipboardSheetIdentity('test-sheet'),
      new SheetCellInputValidationRegistry(),
    );
    const range = { start: [15, 0], end: [15, 1] } as const;

    expect(source.captureMergedRanges(range)).toEqual([{ start: [0, 0], end: [0, 1] }]);
    expect(source.planPasteMergedRanges(source.captureMergedRanges(range), [17, 0]).operations).toEqual([
      { p: [17, 0], uc: { value: { endRow: 17, endColumn: 1 }, prev: null } },
    ]);
    expect(source.planClearMergedRanges(range).operations).toEqual([
      { p: [15, 0], uc: { value: null, prev: { endRow: 15, endColumn: 1 } } },
    ]);
    expect(() => source.captureMergedRanges({ start: [15, 0], end: [15, 0] })).toThrow(
      expect.objectContaining({ code: 'SEAR_SHEET_CLIPBOARD_SOURCE_INTERSECTS_MERGED_CELLS' }),
    );
  });
});
