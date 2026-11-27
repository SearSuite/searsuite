import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';

import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { CellProperties, CellRegion, EmptyCell, SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { readSheetDataMatrix } from '@searsuite/sear-domain-sheet';
import { readSheetCellMerges } from '@searsuite/sear-plugin-cell-merge';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { CellVisualLayerNode, Node } from '@searsuite/sear-render-node';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { computeViewportRange } from '../ViewportRange';
import { readSheetColumnSizes, readSheetRowSizes } from './readSheetDimensions';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { activeFixedRowOffsets, visibleFrozenIndices } from './SheetFreezeLayout';

/** Stateless marker state for the body grid renderer. */
interface ISheetGridRender {}

/** Default visual configuration for body grid cells. */
const sheetGridRenderPluginRenderConfig = {
  defaultBorderColor: 'rgba(220, 221, 229, 1)',
  defaultBackgroundColor: '#FFFFFF',
};

/** Renders visible sheet body cells. */
@Injectable()
export class SheetGridRender extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  readonly #cellVisualReaders: SheetCellVisualReaderRegistry;

  /** Reads the body grid render configuration from ConfigEngine. */
  public getConfig(searCore: SearCoreSheet): typeof sheetGridRenderPluginRenderConfig {
    return searCore.configEngine.getConfig(this.key) as typeof sheetGridRenderPluginRenderConfig;
  }

  /** DI token for resolving the body grid renderer. */
  public static readonly symbol: symbol = Symbol.for('SheetGridRender');

  /** Constructs the body grid renderer. */
  constructor(@Inject(SheetCellVisualReaderRegistry.symbol) cellVisualReaders: SheetCellVisualReaderRegistry) {
    super(new PluginKey());
    this.#cellVisualReaders = cellVisualReaders;
  }

  /** Handles double-click interactions on grid cells. */
  public onDblClick(searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): void {}

  /** Registers default body grid configuration. */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(sheetGridRenderPluginRenderConfig),
      },
    ];
  }

  /**
   * Renders visible grid cells, skipping cells covered by merged ranges.
   * @param searCore - Sheet core containing data and render services.
   * @param offset - Offset after accounting for row/column headers.
   * @returns Render nodes for visible body cells.
   */
  public render(searCore: SearCoreSheet, offset: { x: number; y: number } = { x: 0, y: 0 }): Node<CellProperties>[] {
    const dataEngine = searCore.getDataEngine();
    const sheetData = readSheetDataMatrix(dataEngine);
    const rowSizes = readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    const fixedRows = readSheetFixedRows(dataEngine);
    const mergedCells = readSheetCellMerges(dataEngine);
    if (!sheetData || !rowSizes || !columnSizes) {
      throw new SearError('Sheet data fields are not found in SheetGridRender render.');
    }
    const freeze = readSheetFreeze(dataEngine);

    const pluginConfig = searCore.configEngine.getConfig(this.key) as typeof sheetGridRenderPluginRenderConfig;
    const { renderCoordinatorManager } = searCore.renderEngine;
    const rects = [];

    // Viewport culling: only iterate visible cells instead of the entire sheet.
    // For 10k rows × 100 cols this reduces iteration from 1M to ~800 visible cells.
    const { startCol, endCol, startRow, endRow } = computeViewportRange(
      searCore.renderEngine.scrollManager,
      rowSizes,
      columnSizes,
      offset,
    );

    const [viewportWidth, viewportHeight] = searCore.renderEngine.scrollManager.getShape();
    const scroll = searCore.renderEngine.scrollManager.getState();
    const rows = new Set<number>();
    for (let row = startRow; row <= endRow; row++) rows.add(row);
    visibleFrozenIndices(freeze.rows, rowSizes, viewportHeight - offset.y).forEach((row) => rows.add(row));
    const fixedRowOffsets = activeFixedRowOffsets(fixedRows, rowSizes, scroll.y, freeze.rows, offset.y);
    fixedRowOffsets.forEach((_top, row) => rows.add(row));
    const rowsToRender = [...rows].sort((left, right) => left - right);
    const columns = new Set<number>();
    for (let column = startCol; column <= endCol; column++) columns.add(column);
    visibleFrozenIndices(freeze.columns, columnSizes, viewportWidth - offset.x).forEach((column) =>
      columns.add(column),
    );
    const columnsToRender = [...columns].sort((left, right) => left - right);

    for (const i of columnsToRender) {
      for (const j of rowsToRender) {
        const stroke = pluginConfig.defaultBorderColor;

        const x = columnSizes.getDimensionLeftBoundaryByIndex(i);
        const y = rowSizes.getDimensionLeftBoundaryByIndex(j);

        // Check whether inside merged cell
        if (mergedCells?.findRange(j, i)) continue;

        const width = columnSizes.getItem(0, i) || 0;
        const height = rowSizes.getItem(0, j) || 0;
        if (height <= 0 || width <= 0) continue;
        const data = sheetData.getItem(j, i);

        const fixedY = fixedRowOffsets.get(j);
        const stickyTop = j < freeze.rows || fixedY !== void 0;
        const stickyLeft = i < freeze.columns;
        const positionRect = new PositionRect(x + offset.x, fixedY ?? y + offset.y, width, height);

        const visual = this.#cellVisualReaders.readVisual({ rowIndex: j, columnIndex: i });
        const visualProperties = visual.properties;
        const property: CellProperties = {
          ...visualProperties,
          ...((stickyTop || stickyLeft) && visualProperties.fill === undefined
            ? { fill: pluginConfig.defaultBackgroundColor }
            : {}),
          type: EmptyCell.symbol,
          region: CellRegion.Grid,
          stroke: visualProperties.stroke ?? stroke,
          startColIndex: i,
          endColIndex: i,
          startRowIndex: j,
          endRowIndex: j,
        };
        if (data?.type === 'string' && typeof data.value === 'string' && !data.value.includes('\n')) {
          let overflowWidth = width;
          for (let next = i + 1; next <= endCol && next < columnSizes.shape[1]; next += 1) {
            if (sheetData.getItem(j, next) || mergedCells?.findRange(j, next)) break;
            overflowWidth += columnSizes.getItem(0, next) || 0;
          }
          property.textOverflowWidth = overflowWidth;
        }

        const positionRectProps = {
          x: positionRect.x,
          y: positionRect.y,
          width: positionRect.width,
          height: positionRect.height,
        };

        const context = renderCoordinatorManager.createCellContext(j, i);

        const cell = renderCoordinatorManager.create(
          data || { type: EmptyCell.symbol },
          positionRectProps,
          property,
          context,
        );
        const res = cell?.render();
        if (res) {
          const nodes = Array.isArray(res) ? res : [res];
          const visualNodes = visual.layers.map(
            (layer) =>
              new CellVisualLayerNode<CellProperties>(
                positionRectProps,
                {
                  depth: (property.depth ?? 0) + 0.5 + (layer.zIndex ?? 0) * 0.125,
                  semanticOwner: layer.slot,
                  semanticRole: 'cell-visual-layer',
                },
                layer,
              ),
          );
          if (stickyTop || stickyLeft) {
            const affix = {
              ...(stickyTop ? { top: positionRect.y } : {}),
              ...(stickyLeft ? { left: positionRect.x } : {}),
            };
            nodes.forEach((node) => node.setStickyTree(true, affix));
            visualNodes.forEach((node) => node.setStickyTree(true, affix));
          }
          rects.push(nodes, visualNodes);
        }
      }
    }
    return rects.flat();
  }
}
