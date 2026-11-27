import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';

import { SheetCornerView } from './corner/SheetCornerView';
import { SheetColumnLabelView } from './SheetColumnLabel';

import { SheetRowNumberView } from './SheetRowNumber';
import { SheetGridRender } from './SheetGridRender';

import { CellProperties } from '@searsuite/sear-render-registry';
import { DashedLineNode, Node } from '@searsuite/sear-render-node';
import { readSheetFreeze } from '@searsuite/sear-plugin-freeze';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-domain-sheet';

type SheetGridState = Record<string, never>;

const key = new PluginKey('SheetGrid');

/** Composite plugin that assembles sheet chrome, body grid, and merged-cell nodes. */
@Injectable()
export class SheetGridView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  #sheetCornerPlugin: SheetCornerView;
  #sheetColumnLabelPlugin: SheetColumnLabelView;
  #sheetRowNumberPlugin: SheetRowNumberView;
  #sheetGridRender: SheetGridRender;

  /** DI token for resolving the composite sheet grid plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetGridView');

  /** Constructs the grid plugin from its child sheet render plugins. */
  constructor(
    @Inject(SheetCornerView.symbol)
    sheetCornerPlugin: SheetCornerView,
    @Inject(SheetColumnLabelView.symbol)
    sheetColumnLabelPlugin: SheetColumnLabelView,
    @Inject(SheetRowNumberView.symbol)
    sheetRowNumberPlugin: SheetRowNumberView,
    @Inject(SheetGridRender.symbol) sheetGridRender: SheetGridRender,
  ) {
    super(key);
    this.#sheetCornerPlugin = sheetCornerPlugin;
    this.#sheetColumnLabelPlugin = sheetColumnLabelPlugin;
    this.#sheetRowNumberPlugin = sheetRowNumberPlugin;
    this.#sheetGridRender = sheetGridRender;
  }

  /** Registers configuration contributed by every child sheet render plugin. */
  public registerConfig() {
    return [
      this.#sheetCornerPlugin.registerConfig(),
      this.#sheetColumnLabelPlugin.registerConfig(),
      this.#sheetRowNumberPlugin.registerConfig(),
      this.#sheetGridRender.registerConfig(),
    ].flat();
  }

  /** Forwards double-click handling to the body grid renderer. */
  public onDblClick(earCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): void {
    this.#sheetGridRender.onDblClick(earCore, event);
  }

  /**
   * Renders sheet chrome and body layers in the order expected by the scene graph.
   * @param searCore - Sheet core containing data and render services.
   * @returns Render nodes for corner, headers, merged cells, and grid cells.
   */
  public render(searCore: SearCoreSheet): Node<CellProperties>[] {
    const conrnerNodes = this.#sheetCornerPlugin.render(searCore);
    const conrnerConfig = this.#sheetCornerPlugin.getConfig(searCore);
    const { width, height } = conrnerConfig;

    const columnLabelNodes = this.#sheetColumnLabelPlugin.render(searCore, {
      x: width,
      y: 0,
    });

    const rowLabelNodes = this.#sheetRowNumberPlugin.render(searCore, {
      x: 0,
      y: height,
    });

    const gridNodes = this.#sheetGridRender.render(searCore, {
      x: width,
      y: height,
    });
    const boundaryNodes = this.#renderFreezeBoundaries(searCore, width, height);

    return [
      ...conrnerNodes,
      ...columnLabelNodes,
      ...rowLabelNodes,
      ...(Array.isArray(gridNodes) ? gridNodes : [gridNodes]),
      ...boundaryNodes,
    ];
  }

  #renderFreezeBoundaries(searCore: SearCoreSheet, headerWidth: number, headerHeight: number): Node<CellProperties>[] {
    const dataEngine = searCore.dataEngine;
    if (!dataEngine) return [];
    const freeze = readSheetFreeze(dataEngine);
    const rows = readSheetRowSizes(dataEngine);
    const columns = readSheetColumnSizes(dataEngine);
    if (!rows || !columns || (freeze.rows === 0 && freeze.columns === 0)) return [];
    const { x, y } = searCore.renderEngine.scrollManager.getState();
    const [width, height] = searCore.renderEngine.scrollManager.getShape();
    const nodes: Node<CellProperties>[] = [];
    if (freeze.rows > 0) {
      const bottom = headerHeight + rows.getDimensionLeftBoundaryByIndex(freeze.rows);
      if (bottom < height) {
        const line = new DashedLineNode<CellProperties>(
          { x, y: bottom - 1, width, height: 2 },
          { stroke: '#aeb4bf', strokeWidth: 2, depth: 10, skipHit: true },
          { x1: x, y1: bottom, x2: x + width, y2: bottom },
        );
        line.setStickyTree(true, { top: bottom });
        nodes.push(line);
      }
    }
    if (freeze.columns > 0) {
      const right = headerWidth + columns.getDimensionLeftBoundaryByIndex(freeze.columns);
      if (right < width) {
        const line = new DashedLineNode<CellProperties>(
          { x: right - 1, y, width: 2, height },
          { stroke: '#aeb4bf', strokeWidth: 2, depth: 10, skipHit: true },
          { x1: right, y1: y, x2: right, y2: y + height },
        );
        line.setStickyTree(true, { left: right });
        nodes.push(line);
      }
    }
    return nodes;
  }
}
