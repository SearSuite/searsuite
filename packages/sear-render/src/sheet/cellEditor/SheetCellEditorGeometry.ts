import type { SearCoreSheet } from '@searsuite/sear-assembly-core';
import type { PluginKey } from '@searsuite/sear-assembly-plugin';
import type { Point } from '@searsuite/sear-foundation-rect';
import type { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { CellRegion, type CellProperties } from '@searsuite/sear-render-registry';
import type { DataEngine } from '@searsuite/sear-domain-state';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-plugin-resize';
import { CellRangeHighlightKind, type Highlighting } from './Highlighter';
import type { EditorState } from '@searsuite/sear-plugin-cell-editor';

export function readCellEditorGeometryFields(dataEngine: DataEngine) {
  const rowSizes = readSheetRowSizes(dataEngine);
  const columnSizes = readSheetColumnSizes(dataEngine);
  if (!rowSizes || !columnSizes) return null;
  return { rowSizes, columnSizes };
}

/**
 * Build a selection transaction from the click event target.
 *
 * Mirrors the logic in SheetSelectionPlugin.onMouseDown so that clicking a
 * different cell while editing commits the edit AND selects the new cell in
 * a single batch dispatch.
 *
 * Returns null if the event has no valid cell target.
 */
export function buildSelectionUpdate(
  searCore: SearCoreSheet,
  event: EventWithOffsetAndTarget<CellProperties>,
  extendFromEdit?: PluginKey,
): { anchor: Point; focus: Point; active?: Point } | null {
  const { target } = event;
  if (!target) return null;

  const { properties } = target;
  const { startRowIndex, startColIndex } = properties;
  const { endRowIndex, endColIndex } = properties;

  let anchor: Point;
  let focus: Point;

  const region = properties.region;
  if (region === CellRegion.RowHeader && startRowIndex !== void 0) {
    const dataState = readCellEditorGeometryFields(searCore.getDataEngine());
    if (!dataState) return null;
    const lastCol = dataState.columnSizes.shape[1] - 1;
    anchor = [startRowIndex, 0];
    focus = [endRowIndex ?? startRowIndex, lastCol];
  } else if (region === CellRegion.ColumnHeader && startColIndex !== void 0) {
    const dataState = readCellEditorGeometryFields(searCore.getDataEngine());
    if (!dataState) return null;
    const lastRow = dataState.rowSizes.shape[1] - 1;
    anchor = [0, startColIndex];
    focus = [lastRow, endColIndex ?? startColIndex];
  } else {
    if (startRowIndex === void 0 || startColIndex === void 0) return null;
    anchor = [Number(startRowIndex), Number(startColIndex)];
    focus = [Number(endRowIndex ?? startRowIndex), Number(endColIndex ?? startColIndex)];
  }

  if (extendFromEdit && event.origin.shiftKey && region === CellRegion.Grid) {
    const editorState = searCore.getDataEngine().getDataType<EditorState>(extendFromEdit);
    const origin = editorState?.[0].getPoint(0);
    if (origin && origin[0] >= 0 && origin[1] >= 0) {
      return {
        anchor: [Math.min(origin[0], anchor[0]), Math.min(origin[1], anchor[1])],
        focus: [Math.max(origin[0], focus[0]), Math.max(origin[1], focus[1])],
        active: [...origin],
      };
    }
  }
  return { anchor, focus };
}

export function resolveReferenceHighlightBounds(
  reference: Highlighting['cellRanges'][number],
  shape: { rowCount: number; colCount: number },
): { start: [number, number]; end: [number, number] } | null {
  if (reference.kind === CellRangeHighlightKind.ColumnRange) {
    if (shape.rowCount <= 0 || shape.colCount <= 0) return null;
    return {
      start: [0, reference.startCol],
      end: [shape.rowCount - 1, reference.endCol],
    };
  }
  if (reference.kind === CellRangeHighlightKind.RowRange) {
    if (shape.rowCount <= 0 || shape.colCount <= 0) return null;
    return {
      start: [reference.startRow, 0],
      end: [reference.endRow, shape.colCount - 1],
    };
  }
  return { start: reference.start, end: reference.end };
}
