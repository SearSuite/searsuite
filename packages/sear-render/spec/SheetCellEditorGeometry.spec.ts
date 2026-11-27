import { buildSelectionUpdate, resolveReferenceHighlightBounds } from '../src/sheet/cellEditor/SheetCellEditorGeometry';

import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-domain-sheet';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { CellRegion } from '@searsuite/sear-render-registry';

import { CellRangeHighlightKind } from '@searsuite/sear-render';

function createSheetViewDataTypeReader(sheetState: { sheetData?: unknown; rowSizes?: unknown; columnSizes?: unknown }) {
  const view = {
    sheetData: sheetState.sheetData ?? { getItem: () => null },
    cellAlignments: {},
    rowSizes: sheetState.rowSizes ?? {
      shape: [1, 1],
      getDimensionLeftBoundaryByIndex: () => 0,
      getDimensionRightBoundaryByIndex: () => 24,
    },
    columnSizes: sheetState.columnSizes ?? {
      shape: [1, 1],
      getDimensionLeftBoundaryByIndex: () => 0,
      getDimensionRightBoundaryByIndex: () => 24,
    },
    rowHiddenOriginalSizes: {},
    columnHiddenOriginalSizes: {},
  };
  return (key: unknown): unknown => {
    if (key === SheetDataPlugin.pluginKey) return { sheetData: view.sheetData };
    if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: {} };
    return void 0;
  };
}
function createSheetDataEngine(sheetState: { sheetData?: unknown; rowSizes?: unknown; columnSizes?: unknown }) {
  const getDataType = createSheetViewDataTypeReader(sheetState);
  const view = {
    sheetData: sheetState.sheetData ?? { getItem: () => null },
    cellAlignments: {},
    rowSizes: sheetState.rowSizes ?? {
      shape: [1, 1],
      getDimensionLeftBoundaryByIndex: () => 0,
      getDimensionRightBoundaryByIndex: () => 24,
    },
    columnSizes: sheetState.columnSizes ?? {
      shape: [1, 1],
      getDimensionLeftBoundaryByIndex: () => 0,
      getDimensionRightBoundaryByIndex: () => 24,
    },
    rowHiddenOriginalSizes: {},
    columnHiddenOriginalSizes: {},
  };
  return {
    getDataType,
    readDataViewField: (viewKey: string, fieldKey: string) => {
      if (viewKey !== SheetDataFieldNamespace) return null;
      if (fieldKey === SheetDataMatrixFieldKey) return view.sheetData;
      if (fieldKey === SheetHorizontalAlignmentFieldKey) return view.cellAlignments;
      if (fieldKey === SheetRowSizesFieldKey) return view.rowSizes;
      if (fieldKey === SheetColumnSizesFieldKey) return view.columnSizes;
      if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return view.rowHiddenOriginalSizes;
      if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return view.columnHiddenOriginalSizes;
      return null;
    },
  };
}
describe('cell editor geometry', () => {
  it('buildSelectionUpdate maps row/column headers and handles missing data safely', () => {
    const state = {
      rowSizes: { shape: [1, 8] },
      columnSizes: { shape: [1, 10] },
    };
    const core = {
      getDataEngine: () => ({
        ...createSheetDataEngine(state),
      }),
    };

    const row = buildSelectionUpdate(
      core as never,
      {
        target: {
          properties: { region: CellRegion.RowHeader, startRowIndex: 2, startColIndex: 0, endRowIndex: 3 },
        },
      } as never,
    );
    expect(row?.anchor).toEqual([2, 0]);
    expect(row?.focus).toEqual([3, 9]);

    const col = buildSelectionUpdate(
      core as never,
      {
        target: {
          properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 1, endColIndex: 2 },
        },
      } as never,
    );
    expect(col?.anchor).toEqual([0, 1]);
    expect(col?.focus).toEqual([7, 2]);

    const normal = buildSelectionUpdate(
      core as never,
      { target: { properties: { startRowIndex: 4, startColIndex: 5 } } } as never,
    );
    expect(normal?.anchor).toEqual([4, 5]);
    expect(normal?.focus).toEqual([4, 5]);

    const noTarget = buildSelectionUpdate(core as never, {} as never);
    expect(noTarget).toBeNull();

    const missingCell = buildSelectionUpdate(
      core as never,
      { target: { properties: { startRowIndex: void 0, startColIndex: 1 } } } as never,
    );
    expect(missingCell).toBeNull();

    const noState = buildSelectionUpdate(
      { getDataEngine: () => ({ getDataType: () => void 0 }) } as never,
      { target: { properties: { region: CellRegion.RowHeader, startRowIndex: 1 } } } as never,
    );
    expect(noState).toBeNull();

    const noColumnState = buildSelectionUpdate(
      { getDataEngine: () => ({ getDataType: () => void 0 }) } as never,
      { target: { properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 1 } } } as never,
    );
    expect(noColumnState).toBeNull();
  });
  it('skips reference highlights when the sheet has no rows or columns', () => {
    expect(
      resolveReferenceHighlightBounds({ kind: CellRangeHighlightKind.ColumnRange, startCol: 0, endCol: 1 } as never, {
        rowCount: 0,
        colCount: 5,
      }),
    ).toBeNull();

    expect(
      resolveReferenceHighlightBounds({ kind: CellRangeHighlightKind.RowRange, startRow: 0, endRow: 1 } as never, {
        rowCount: 5,
        colCount: 0,
      }),
    ).toBeNull();
  });
});
