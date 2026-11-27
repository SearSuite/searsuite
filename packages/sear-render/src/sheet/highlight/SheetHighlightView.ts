import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { FixBoxNode, createDragGuideNode, type Node } from '@searsuite/sear-render-node';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-domain-sheet';
import { type CellProperties } from '@searsuite/sear-render-registry';

import { getSheetRangePositionRect } from '../getSheetRangePositionRect';
import { SheetHighlightRegistry, SheetHighlightEdge } from './SheetHighlightRegistry';
import { type SheetConfig } from '@searsuite/sear-assembly-config';

const key = new PluginKey('SheetHighlight');

/** Renders registered range-highlighter output as a single managed scene layer. */
@Injectable()
export class SheetHighlightView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  readonly #registry: SheetHighlightRegistry;

  /** DI token for resolving SheetHighlightView. */
  public static readonly symbol = Symbol.for('SheetHighlightView');
  /** Stable plugin key for SheetHighlightView. */
  public static readonly pluginKey = key;

  #searCore: SearCoreSheet | null = null;

  /** Creates a SheetHighlightView instance. */
  constructor(
    @Inject(SheetHighlightRegistry.symbol)
    registry: SheetHighlightRegistry,
  ) {
    super(key);
    this.#registry = registry;
    this.#registry.subscribe(this.#handleHighlightRegistryChanged.bind(this));
  }

  #handleHighlightRegistryChanged(): void {
    if (this.#searCore) this.#searCore.requestRender(this);
  }

  /** Renders SheetHighlightView scene output. */
  public render(searCore: SearCoreSheet): Node<CellProperties>[] {
    this.#searCore = searCore;
    const dataEngine = searCore.getDataEngine();
    const rowSizes = readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    if (!rowSizes || !columnSizes) return [];

    const config = searCore.configEngine.getDefaultConfig() as Partial<SheetConfig>;
    const offsetX = config.sheetOffsetX ?? 50;
    const offsetY = config.sheetOffsetY ?? 24;
    return this.#registry.getHighlights({ searCore }).flatMap((highlight) => {
      const positionRect = getSheetRangePositionRect(highlight.start, highlight.end, {
        rowSizes,
        columnSizes,
        offsetX,
        offsetY,
      });
      if (!positionRect) return [];
      const edge = highlight.edge;
      const horizontal = edge === SheetHighlightEdge.Top || edge === SheetHighlightEdge.Bottom;
      if (edge) {
        const scroll = searCore.renderEngine.scrollManager;
        const { x, y } = scroll.getState();
        const [width, height] = scroll.getShape();
        const coordinate = horizontal
          ? positionRect.y + (edge === SheetHighlightEdge.Bottom ? positionRect.height : 0)
          : positionRect.x + (edge === SheetHighlightEdge.Right ? positionRect.width : 0);
        return [
          createDragGuideNode<CellProperties>(
            horizontal
              ? { x1: x, y1: coordinate, x2: x + width, y2: coordinate }
              : { x1: coordinate, y1: y, x2: coordinate, y2: y + height },
            {
              type: highlight.type ?? 'sheet-range-guide',
              depth: highlight.depth ?? 0,
              ...(highlight.stroke !== undefined ? { stroke: highlight.stroke } : {}),
              ...(highlight.strokeWidth !== undefined ? { strokeWidth: highlight.strokeWidth } : {}),
            },
          ),
        ];
      }
      const inset = highlight.inset ?? 0;
      const insetPositionRect = new PositionRect(
        positionRect.x + inset,
        positionRect.y + inset,
        Math.max(0, positionRect.width - inset * 2),
        Math.max(0, positionRect.height - inset * 2),
      );
      return [
        new FixBoxNode<CellProperties>(insetPositionRect, {
          type: highlight.type ?? 'sheet-range-highlight',
          depth: highlight.depth ?? 0,
          strokeWidth: highlight.strokeWidth ?? 1,
          stroke: highlight.stroke,
          fill: highlight.fill,
          skipHit: highlight.skipHit ?? true,
          ...(highlight.overlay ? { isEdit: true } : {}),
        }),
      ];
    });
  }
}
