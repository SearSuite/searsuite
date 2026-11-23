import { SearError } from '@searsuite/sear-foundation-error';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { readSheetCellMerges } from '@searsuite/sear-plugin-cell-merge';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { readSheetDataMatrix, readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-render-engine';
import { CellProperties, CellRegion, EmptyCell, SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { CellVisualLayerNode, Node } from '@searsuite/sear-render-node';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { getSheetRangePositionRect } from './getSheetRangePositionRect';
import { activeFixedRowOffsets } from './SheetFreezeLayout';

const key = new PluginKey('SheetCellMergeRender');
const renderConfig = { defaultBorderColor: 'rgba(220, 221, 229, 1)' };

/** Renders merged ranges owned by SheetCellMergePlugin. */
@Injectable()
export class SheetCellMergeRender extends Plugin<SearCoreSheet, CellProperties, Record<string, never>> {
  public static readonly symbol = Symbol.for('SheetCellMergeRender');
  public static readonly pluginKey = key;
  public override readonly depth = 1;
  public override readonly interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.ResizeRow,
    MatrixOTActionName.ResizeCol,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  public constructor(
    @Inject(SheetCellVisualReaderRegistry.symbol)
    private readonly cellVisualReaders: SheetCellVisualReaderRegistry,
  ) {
    super({ key, state: {} });
  }

  public override registerState() {
    return { key: this.key, state: this.getState() };
  }

  public override apply(): Record<string, never> {
    return this.getState();
  }

  public getPluginConfig(searCore: SearCoreSheet): typeof renderConfig {
    return searCore.configEngine.getPluginConfig(this.key) as typeof renderConfig;
  }

  public override registerConfig() {
    return [{ key: this.key, config: new ConfigUnit(renderConfig) }];
  }

  public onMouseDown(_searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): void {}
  public onMouseMove(_searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): void {}
  public onMouseUp(_searCore: SearCoreSheet, _event: EventWithOffsetAndTarget<CellProperties>): void {}

  public render(searCore: SearCoreSheet, offset: { x: number; y: number } = { x: 50, y: 24 }) {
    const dataEngine = searCore.getDataEngine();
    const sheetData = readSheetDataMatrix(dataEngine);
    const rowSizes = readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    const merges = readSheetCellMerges(dataEngine);
    const freeze = readSheetFreeze(dataEngine);
    const fixedRows = readSheetFixedRows(dataEngine);
    if (!sheetData || !rowSizes || !columnSizes || !merges) {
      throw new SearError('Sheet data fields are not found in SheetCellMergeRender render.');
    }
    const { renderCoordinatorManager } = searCore.renderEngine;
    const config = this.getPluginConfig(searCore);
    const nodes: Node<CellProperties>[] = [];
    const fixedOffsets = fixedRows
      ? activeFixedRowOffsets(fixedRows, rowSizes,
          searCore.renderEngine.scrollManager.getState().y, freeze.rows, offset.y)
      : new Map<number, number>();
    merges.forEachStored((value, row, column) => {
      if (value === null) return;
      const positionRect = getSheetRangePositionRect([row, column], [value.endRow, value.endColumn], {
        rowSizes,
        columnSizes,
        offsetX: offset.x,
        offsetY: offset.y,
      });
      if (!positionRect) return;
      const fixedY = fixedOffsets.get(row);
      if (fixedY !== void 0) positionRect.y = fixedY;
      const stickyTop = row < freeze.rows || fixedY !== void 0;
      const stickyLeft = column < freeze.columns;
      const affix = { ...(stickyTop ? { top: positionRect.y } : {}),
        ...(stickyLeft ? { left: positionRect.x } : {}) };
      const visual = this.cellVisualReaders.readVisual({ rowIndex: row, columnIndex: column });
      const visualProperties = visual.properties;
      const property: CellProperties = {
        ...visualProperties,
        type: EmptyCell.symbol,
        region: CellRegion.Grid,
        stroke: visualProperties.stroke ?? config.defaultBorderColor,
        startColIndex: column,
        endColIndex: value.endColumn,
        startRowIndex: row,
        endRowIndex: value.endRow,
        depth: this.depth,
      };
      const cell = renderCoordinatorManager.create(
        sheetData.getItem(row, column) || { type: EmptyCell.symbol },
        positionRect,
        property,
        renderCoordinatorManager.createCellContext(row, column),
      );
      const rendered = cell?.render();
      if (rendered) {
        const renderedNodes = Array.isArray(rendered) ? rendered : [rendered];
        const visualNodes = visual.layers.map((layer) => new CellVisualLayerNode<CellProperties>(positionRect, {
          depth: this.depth + 0.5 + (layer.zIndex ?? 0) * 0.125,
          semanticOwner: layer.slot,
          semanticRole: 'cell-visual-layer',
        }, layer));
        if (stickyTop || stickyLeft) {
          renderedNodes.forEach((node) => node.setStickyTree(true, affix));
          visualNodes.forEach((node) => node.setStickyTree(true, affix));
        }
        nodes.push(...renderedNodes, ...visualNodes);
      }
    });
    return nodes;
  }
}
