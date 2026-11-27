import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';

import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ScrollManagerState } from '@searsuite/sear-render-scroll';
import { Injectable } from '@searsuite/sear-foundation-di';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { AffixCell, CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { Node } from '@searsuite/sear-render-node';

/** Stateless marker state for the sheet corner plugin. */
interface ISheetCorner {}

/** Default visual configuration for the sheet corner select-all button. */
const SheetCornerPluginRenderConfig = {
  width: 50,
  height: 24,
  backgroundColor: 'rgba(250, 251, 251, 1)',
  borderColor: 'rgba(220, 221, 229, 1)',
};

/** Renders the sticky sheet corner cell where row and column headers meet. */
@Injectable()
export class SheetCornerView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  /** DI token for resolving the sheet corner plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetCornerView');

  /** Constructs the sheet corner plugin. */
  constructor() {
    super(new PluginKey());
  }

  /** Initializes sheet corner runtime state. */
  public initialize(): void {}

  /** Sheet corner position is recomputed during render from scroll state. */
  public onScroll(_scrollManagerState: ScrollManagerState): void {}

  /** Sheet corner dimensions are recomputed during render after resize. */
  public onResize(): void {}

  /** Registers default sheet corner configuration. */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(SheetCornerPluginRenderConfig),
      },
    ];
  }

  /** Reads the sheet corner render configuration from ConfigEngine. */
  public getConfig(searCore: SearCoreSheet): typeof SheetCornerPluginRenderConfig {
    return searCore.configEngine.getConfig(this.key) as typeof SheetCornerPluginRenderConfig;
  }

  /**
   * Renders the sheet corner cell.
   * @param searCore - Sheet core containing render services.
   * @param offset - World offset applied by sticky rendering.
   * @returns Render nodes for the sheet corner.
   */
  public render(searCore: SearCoreSheet, offset: { x: number; y: number } = { x: 0, y: 0 }): Node<CellProperties>[] {
    const pluginConfig = searCore.configEngine.getConfig(this.key) as typeof SheetCornerPluginRenderConfig;
    const { width, height, backgroundColor, borderColor } = pluginConfig;

    const rects = [];
    const { renderCoordinatorManager } = searCore.renderEngine;

    const positionRect = {
      x: 0 + offset.x,
      y: 0 + offset.y,
      width,
      height,
    };

    const cell = renderCoordinatorManager.create({ type: AffixCell.symbol }, positionRect, {
      type: AffixCell.symbol,
      region: CellRegion.Corner,
      left: 0,
      top: 0,
      fill: backgroundColor,
      stroke: borderColor,
    });
    const res = cell?.render();

    if (res) rects.push(res);

    return rects.flat();
  }
}
