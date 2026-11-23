import { SearError } from '@searsuite/sear-foundation-error';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Operation } from '@searsuite/sear-domain-ot';
import { PluginKey, Plugin } from '@searsuite/sear-assembly-plugin';
import { ScrollManagerState } from '@searsuite/sear-render-scroll';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';
import { Node } from '@searsuite/sear-render-node';
import { AffixCell, CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { computeViewportRange } from '../ViewportRange';
import { readSheetColumnSizes, readSheetRowSizes } from './readSheetDimensions';
import { readSheetFixedRows } from '@searsuite/sear-plugin-fixed-row';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { activeFixedRowOffsets, visibleFrozenIndices } from './SheetFreezeLayout';

/** Stateless marker state for the row header plugin. */
interface ISheetRowNumber {}

/** Renders sticky row header cells for the visible viewport range. */
@Injectable()
export class SheetRowNumberPlugin extends Plugin<SearCoreSheet, CellProperties, ISheetRowNumber> {
  /** Registers the stateless row header plugin with PluginManager. */
  public registerState(): { key: PluginKey; state: ISheetRowNumber } {
    return { key: this.key, state: this.getState() };
  }

  /** Reads the row header render configuration from ConfigEngine. */
  public getPluginConfig(searCore: SearCoreSheet): typeof SheetRowNumberPlugin.defaultConfig {
    return searCore.configEngine.getPluginConfig(this.key) as typeof SheetRowNumberPlugin.defaultConfig;
  }

  /** DI token for resolving the row header plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetRowNumberPlugin');

  /** Default visual configuration for row headers. */
  public static readonly defaultConfig = {
    defaultWidth: 50,
    defaultBackgroundColor: 'rgba(250, 251, 251, 1)',
    defaultBorderColor: 'rgba(220, 221, 229, 1)',
  };

  /** Constructs the row header plugin. */
  constructor() {
    super({
      key: new PluginKey(),
      state: {},
    });
  }

  /** Initializes row header runtime state. */
  public initialize(): void {}

  /** Returns unchanged plugin state for every transaction. */
  public apply(operations: Operation[]) {
    return this.getState();
  }

  // public onClick(event: EventWithOffsetAndTarget): void { }
  /** Row header positions are recomputed during render from scroll state. */
  public onScroll(_scrollManagerState: ScrollManagerState): void {}

  /** Row header dimensions are recomputed during render after resize. */
  public onResize(): void {}

  /** Registers default row header configuration. */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(SheetRowNumberPlugin.defaultConfig),
      },
    ];
  }

  /**
   * Renders visible row header cells.
   * @param searCore - Sheet core containing data and render services.
   * @param offset - World offset applied by sticky rendering.
   * @returns Render nodes for visible row headers.
   */
  public render(searCore: SearCoreSheet, offset: { x: number; y: number } = { x: 0, y: 0 }): Node<CellProperties>[] {
    const dataEngine = searCore.dataEngine;
    const rowSizes = readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    const fixedRows = readSheetFixedRows(dataEngine);
    if (!rowSizes || !columnSizes) {
      throw new SearError('Sheet dimension fields are not found in SheetRowNumberPlugin render.');
    }
    const freeze = readSheetFreeze(dataEngine);

    const pluginConfig = searCore.configEngine.getPluginConfig(this.key) as typeof SheetRowNumberPlugin.defaultConfig;
    const { defaultWidth } = pluginConfig;
    const { renderCoordinatorManager } = searCore.renderEngine;

    const rects = [];

    // Viewport culling: only render visible row headers
    const { startRow, endRow } = computeViewportRange(
      searCore.renderEngine.scrollManager,
      rowSizes,
      columnSizes,
      offset,
    );

    const rows = new Set<number>();
    for (let row = startRow; row <= endRow; row++) rows.add(row);
    const scroll = searCore.renderEngine.scrollManager.getState();
    const [, viewportHeight] = searCore.renderEngine.scrollManager.getShape();
    visibleFrozenIndices(freeze.rows, rowSizes, viewportHeight - offset.y).forEach((row) => rows.add(row));
    const fixedRowOffsets = activeFixedRowOffsets(fixedRows, rowSizes, scroll.y, freeze.rows, offset.y);
    fixedRowOffsets.forEach((_top, row) => rows.add(row));
    const rowsToRender = [...rows].sort((left, right) => left - right);

    for (const i of rowsToRender) {
      const height = rowSizes.getItem(0, i) || 0;
      if (height === 0) continue;

      const x = columnSizes.getDimensionLeftBoundaryByIndex(0);
      const y = rowSizes.getDimensionLeftBoundaryByIndex(i);

      const fixedY = fixedRowOffsets.get(i);
      const positionRect = {
        x: x + offset.x,
        y: fixedY ?? y + offset.y,
        width: defaultWidth,
        height,
      };

      const cell = renderCoordinatorManager.create({ type: AffixCell.symbol, value: i + 1 }, positionRect, {
        type: AffixCell.symbol,
        region: CellRegion.RowHeader,
        left: 0,
        fill: pluginConfig.defaultBackgroundColor,
        stroke: pluginConfig.defaultBorderColor,
        horizontalAlign: SheetHorizontalAlignment.Center,
        startRowIndex: i,
        endRowIndex: i,
        startColIndex: 0,
        endColIndex: columnSizes.shape[1] - 1,
      });
      const res = cell?.render();

      if (res) {
        const nodes = Array.isArray(res) ? res : [res];
        if (i < freeze.rows || fixedY !== void 0) {
          nodes.forEach((node) => node.setStickyTree(true, { top: positionRect.y, left: 0 }));
        }
        rects.push(res);
      }
    }
    return rects.flat();
  }
}
