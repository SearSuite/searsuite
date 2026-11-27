import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearError } from '@searsuite/sear-foundation-error';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';

import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ScrollManagerState } from '@searsuite/sear-render-scroll';
import { Injectable } from '@searsuite/sear-foundation-di';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { AffixCell, CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { Node } from '@searsuite/sear-render-node';
import { SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';
import { Range } from '@searsuite/sear-foundation-range';
import { computeViewportRange } from '../ViewportRange';
import { readSheetColumnSizes, readSheetRowSizes } from './readSheetDimensions';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { visibleFrozenIndices } from './SheetFreezeLayout';

/** Stateless marker state for the column header plugin. */
interface ISheetColumnLabel {}

/** Renders sticky column header cells for the visible viewport range. */
@Injectable()
export class SheetColumnLabelView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  /** Reads the column header render configuration from ConfigEngine. */
  public getConfig(searCore: SearCoreSheet): typeof SheetColumnLabelView.defaultConfig {
    return searCore.configEngine.getConfig(this.key) as typeof SheetColumnLabelView.defaultConfig;
  }

  /** DI token for resolving the column header plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetColumnLabelView');

  /** Default visual configuration for column headers. */
  public static readonly defaultConfig = {
    defaultHeight: 24,
    defaultBackgroundColor: 'rgba(250, 251, 251, 1)',
    defaultBorderColor: 'rgba(220, 221, 229, 1)',
  };

  /** Constructs the column header plugin. */
  constructor() {
    super(new PluginKey());
  }

  /** Initializes column header runtime state. */
  public initialize(): void {}

  /** Column header positions are recomputed during render from scroll state. */
  public onScroll(_scrollManagerState: ScrollManagerState): void {}

  /** Column header dimensions are recomputed during render after resize. */
  public onResize(): void {}

  /** Registers default column header configuration. */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(SheetColumnLabelView.defaultConfig),
      },
    ];
  }

  /**
   * Renders visible column header cells.
   * @param searCore - Sheet core containing data and render services.
   * @param offset - World offset applied by sticky rendering.
   * @returns Render nodes for visible column headers.
   */
  public render(searCore: SearCoreSheet, offset: { x: number; y: number } = { x: 0, y: 0 }): Node<CellProperties>[] {
    const dataEngine = searCore.dataEngine;
    const rowSizes = readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    if (!rowSizes || !columnSizes) {
      throw new SearError('Sheet dimension fields are not found in SheetColumnLabelView render.');
    }
    const freeze = readSheetFreeze(dataEngine);

    const pluginConfig = searCore.configEngine.getConfig(this.key) as typeof SheetColumnLabelView.defaultConfig;
    const { defaultHeight } = pluginConfig;
    const { renderCoordinatorManager } = searCore.renderEngine;

    const rects = [];

    // Viewport culling: only render visible column headers
    const { startCol, endCol } = computeViewportRange(
      searCore.renderEngine.scrollManager,
      rowSizes,
      columnSizes,
      offset,
    );

    const [viewportWidth] = searCore.renderEngine.scrollManager.getShape();
    const columns = new Set<number>();
    for (let column = startCol; column <= endCol; column++) columns.add(column);
    visibleFrozenIndices(freeze.columns, columnSizes, viewportWidth - offset.x).forEach((column) =>
      columns.add(column),
    );
    for (const i of [...columns].sort((left, right) => left - right)) {
      const width = columnSizes.getItem(0, i) || 0;
      if (width === 0) continue;

      const x = columnSizes.getDimensionLeftBoundaryByIndex(i);
      const y = rowSizes.getDimensionLeftBoundaryByIndex(0);

      const positionRect = {
        x: x + offset.x,
        y: y + offset.y,
        width,
        height: defaultHeight,
      };

      const cell = renderCoordinatorManager.create(
        { type: AffixCell.symbol, value: Range.numberToColumn(i + 1) },
        positionRect,
        {
          type: AffixCell.symbol,
          region: CellRegion.ColumnHeader,
          top: 0,
          fill: pluginConfig.defaultBackgroundColor,
          stroke: pluginConfig.defaultBorderColor,
          horizontalAlign: SheetHorizontalAlignment.Center,
          startRowIndex: 0,
          endRowIndex: rowSizes.shape[1] - 1,
          startColIndex: i,
          endColIndex: i,
        },
      );
      const res = cell?.render();

      if (res) {
        if (i < freeze.columns) {
          const nodes = Array.isArray(res) ? res : [res];
          nodes.forEach((node) => node.setStickyTree(true, { top: 0, left: positionRect.x }));
        }
        rects.push(res);
      }
    }

    return rects.flat();
  }
}
