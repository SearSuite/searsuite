import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { type Rect as RectRange } from '@searsuite/sear-foundation-rect';
import { type CoordinateEngine } from '@searsuite/sear-render-coord';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { type CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { type CSRMatrix, type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  readSheetDataMatrix,
  readSheetRawRowSizes,
  readSheetRowSizes,
  readSheetColumnSizes,
  readSheetRowHiddenOriginalSizes,
  readSheetColumnHiddenOriginalSizes,
} from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { readSheetCellAlignments } from '@searsuite/sear-plugin-alignment';
import { type CellFormatMatrix, readSheetCellFormats } from '@searsuite/sear-plugin-cell-format';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import type { SheetResizeDimensions } from '@searsuite/sear-plugin-resize';

export interface ResizeSheetFields {
  sheetData: SheetMatrix;
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
  cellAlignments: { getItem(row: number, col: number): string | null };
  rowHiddenOriginalSizes: CSRMatrix<number>;
  columnHiddenOriginalSizes: CSRMatrix<number>;
  cellFormats: CellFormatMatrix | null;
}

/** Pointer expressed in both sheet-world and viewport coordinates. */
export interface ResizePointer {
  world: { x: number; y: number };
  view: { x: number; y: number };
  region?: CellProperties['region'];
}

export interface DragTarget {
  type: ResizeAxis;
  primaryIndex: number;
  initialSizes: Map<number, number>;
}

export const ResizeAxis = {
  Row: 'row',
  Column: 'col',
} as const;

export type ResizeAxis = (typeof ResizeAxis)[keyof typeof ResizeAxis];

export const HEADER_WIDTH = 50;

export const HEADER_HEIGHT = 24;

const HANDLE_SIZE = 8;

export const MIN_ROW_HEIGHT = 0;

export const MIN_COL_WIDTH = 0;

export function readResizeSheetFields(
  searCore: SearCoreSheet,
  dimensions: SheetResizeDimensions | null = null,
  rawRows = false,
): ResizeSheetFields | null {
  const coreWithDataEngine = searCore as SearCoreSheet & {
    dataEngine?: DataEngine;
  };
  const dataEngine = searCore.getDataEngine?.() ?? coreWithDataEngine.dataEngine;
  if (dataEngine) {
    const sheetData = readSheetDataMatrix(dataEngine);
    const rowSizes = rawRows ? readSheetRawRowSizes(dataEngine) : readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    const cellAlignments = readSheetCellAlignments(dataEngine);
    const cellFormats = readSheetCellFormats(dataEngine);
    const rowHiddenOriginalSizes = readSheetRowHiddenOriginalSizes(dataEngine);
    const columnHiddenOriginalSizes = readSheetColumnHiddenOriginalSizes(dataEngine);
    if (sheetData && rowSizes && columnSizes && rowHiddenOriginalSizes && columnHiddenOriginalSizes) {
      return {
        sheetData,
        rowSizes,
        columnSizes,
        cellAlignments: cellAlignments ?? { getItem: () => null },
        cellFormats,
        rowHiddenOriginalSizes,
        columnHiddenOriginalSizes,
      } as ResizeSheetFields;
    }
  }
  if (dimensions) {
    return {
      sheetData: new SheetMatrix(void 0, [dimensions.rowSizes.shape[1], dimensions.columnSizes.shape[1]]),
      rowSizes: dimensions.rowSizes,
      columnSizes: dimensions.columnSizes,
      cellAlignments: { getItem: () => null },
      cellFormats: null,
      rowHiddenOriginalSizes: dimensions.rowHiddenOriginalSizes,
      columnHiddenOriginalSizes: dimensions.columnHiddenOriginalSizes,
    };
  }
  return null;
}

export function getSelectedIndices(
  searCore: SearCoreSheet,
  type: ResizeAxis,
  draggedIndex: number,
  dimensions: SheetResizeDimensions | null = null,
): number[] | null {
  const selectionState = searCore.pluginManager.getPluginState<[RectRange, RectRange]>(SheetSelectionPlugin.pluginKey);
  if (!selectionState) return null;

  const bounds = selectionState[1];
  if (!bounds) return null;
  const [start, end] = [bounds.getPoint(0), bounds.getPoint(1)];
  if (!start || !end) return null;

  const sheetFields = readResizeSheetFields(searCore, dimensions);
  if (!sheetFields) return null;

  if (type === ResizeAxis.Row) {
    const lastCol = sheetFields.columnSizes.shape[1] - 1;
    if (start[1] !== 0 || end[1] !== lastCol) return null;
    if (draggedIndex < start[0] || draggedIndex > end[0]) return null;
    const indices: number[] = [];
    for (let r = start[0]; r <= end[0]; r++) indices.push(r);
    return indices;
  }

  const lastRow = sheetFields.rowSizes.shape[1] - 1;
  if (start[0] !== 0 || end[0] !== lastRow) return null;
  if (draggedIndex < start[1] || draggedIndex > end[1]) return null;
  const indices: number[] = [];
  for (let c = start[1]; c <= end[1]; c++) indices.push(c);
  return indices;
}

export function detectResizeHandle(
  searCore: SearCoreSheet,
  pointer: ResizePointer,
  dimensions: SheetResizeDimensions | null = null,
): DragTarget | null {
  const sheetFields = readResizeSheetFields(searCore, dimensions);
  if (!sheetFields) return null;

  const { rowSizes, columnSizes } = sheetFields;
  const { world, view, region } = pointer;

  // Row and column headers are affixed on one axis.  Header membership
  // must be checked in viewport coordinates on that fixed axis, while
  // row/column boundaries remain sheet-world coordinates on the scroll
  // axis.  Using world coordinates for both made the header unreachable
  // after horizontal/vertical scrolling respectively.
  const isRowHeader = region === CellRegion.RowHeader || (view.x < HEADER_WIDTH && view.y >= HEADER_HEIGHT);
  const isColumnHeader = region === CellRegion.ColumnHeader || (view.y < HEADER_HEIGHT && view.x >= HEADER_WIDTH);

  if (isRowHeader) {
    const dataY = world.y - HEADER_HEIGHT;
    try {
      const rowIndex = rowSizes.getRightBoundaryColIndexByDimension(dataY);
      const rowBottom = rowSizes.getDimensionRightBoundaryByIndex(rowIndex) + HEADER_HEIGHT;
      if (Math.abs(world.y - rowBottom) <= HANDLE_SIZE) {
        const currentHeight = rowSizes.getItem(0, rowIndex) || MIN_ROW_HEIGHT;
        return {
          type: ResizeAxis.Row,
          primaryIndex: rowIndex,
          initialSizes: new Map([[rowIndex, currentHeight]]),
        };
      }
      if (rowIndex > 0) {
        const prevRowBottom = rowSizes.getDimensionRightBoundaryByIndex(rowIndex - 1) + HEADER_HEIGHT;
        if (Math.abs(world.y - prevRowBottom) <= HANDLE_SIZE) {
          const prevHeight = rowSizes.getItem(0, rowIndex - 1) || MIN_ROW_HEIGHT;
          return {
            type: ResizeAxis.Row,
            primaryIndex: rowIndex - 1,
            initialSizes: new Map([[rowIndex - 1, prevHeight]]),
          };
        }
      }
    } catch {}
  }

  if (isColumnHeader) {
    const dataX = world.x - HEADER_WIDTH;
    try {
      const colIndex = columnSizes.getRightBoundaryColIndexByDimension(dataX);
      const colRight = columnSizes.getDimensionRightBoundaryByIndex(colIndex) + HEADER_WIDTH;
      if (Math.abs(world.x - colRight) <= HANDLE_SIZE) {
        const currentWidth = columnSizes.getItem(0, colIndex) || MIN_COL_WIDTH;
        return {
          type: ResizeAxis.Column,
          primaryIndex: colIndex,
          initialSizes: new Map([[colIndex, currentWidth]]),
        };
      }
      if (colIndex > 0) {
        const prevColRight = columnSizes.getDimensionRightBoundaryByIndex(colIndex - 1) + HEADER_WIDTH;
        if (Math.abs(world.x - prevColRight) <= HANDLE_SIZE) {
          const prevWidth = columnSizes.getItem(0, colIndex - 1) || MIN_COL_WIDTH;
          return {
            type: ResizeAxis.Column,
            primaryIndex: colIndex - 1,
            initialSizes: new Map([[colIndex - 1, prevWidth]]),
          };
        }
      }
    } catch {}
  }

  return null;
}

export function detectHiddenMarkerClick(
  searCore: SearCoreSheet,
  pointer: ResizePointer,
  dimensions: SheetResizeDimensions | null = null,
): { type: ResizeAxis; index: number } | null {
  const sheetFields = readResizeSheetFields(searCore, dimensions);
  if (!sheetFields) return null;

  const { rowSizes, columnSizes } = sheetFields;
  const { world, view, region } = pointer;

  const isRowHeader = region === CellRegion.RowHeader || (view.x < HEADER_WIDTH && view.y >= HEADER_HEIGHT);
  const isColumnHeader = region === CellRegion.ColumnHeader || (view.y < HEADER_HEIGHT && view.x >= HEADER_WIDTH);

  if (isRowHeader) {
    const rowHidden = sheetFields.rowHiddenOriginalSizes;
    let hit: { type: ResizeAxis; index: number } | null = null;
    rowHidden.forEachStored((_value, _row, rowIndex) => {
      if (hit) return;
      const rowBoundary = rowSizes.getDimensionRightBoundaryByIndex(rowIndex) + HEADER_HEIGHT;
      if (Math.abs(world.y - rowBoundary) <= 6) {
        hit = { type: ResizeAxis.Row, index: rowIndex };
      }
    });
    if (hit) return hit;
  }

  if (isColumnHeader) {
    const columnHidden = sheetFields.columnHiddenOriginalSizes;
    let hit: { type: ResizeAxis; index: number } | null = null;
    columnHidden.forEachStored((_value, _row, colIndex) => {
      if (hit) return;
      const colBoundary = columnSizes.getDimensionRightBoundaryByIndex(colIndex) + HEADER_WIDTH;
      if (Math.abs(world.x - colBoundary) <= 6) {
        hit = { type: ResizeAxis.Column, index: colIndex };
      }
    });
    if (hit) return hit;
  }

  return null;
}

/**
 * Resolves an input point for mixed-coordinate header interactions.
 * Sticky header axes use view coordinates; the scrolling axes use world
 * coordinates so dimension boundaries still refer to the sheet model.
 */
export function getResizePointer(
  coordinates: CoordinateEngine,
  event?: EventWithOffsetAndTarget<CellProperties>,
): ResizePointer {
  if (event) {
    const { offsetX, offsetY } = event.origin;
    return {
      world: coordinates.screenToWorld(offsetX, offsetY),
      view: coordinates.screenToView(offsetX, offsetY),
      region: event.target?.properties.region,
    };
  }

  return {
    world: coordinates.getCurrentMouseWorld(),
    view: coordinates.getCurrentMouseView(),
  };
}
