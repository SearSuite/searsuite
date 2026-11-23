import { SearError } from '@searsuite/sear-foundation-error';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Operation, RectOTActionName, MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Rect as RectRange } from '@searsuite/sear-foundation-rect';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Node } from '@searsuite/sear-render-node';
import { SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';
import { type DataEngine } from '@searsuite/sear-render-engine';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-plugin-resize';
import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { AffixCell, CellProperties } from '@searsuite/sear-render-registry';
import { computeViewportRange, SheetCornerPlugin, type ViewportRange } from '@searsuite/sear-render';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';

/**
 * Unique plugin key used by the plugin system for registration and state/config lookup.
 */
const key = new PluginKey('SheetHeaderHighlight');

interface HeaderHighlightGeometry {
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
}

function readHeaderHighlightGeometry(dataEngine: DataEngine): HeaderHighlightGeometry | null {
  const rowSizes = readSheetRowSizes(dataEngine);
  const columnSizes = readSheetColumnSizes(dataEngine);
  return rowSizes && columnSizes ? { rowSizes, columnSizes } : null;
}

/**
 * Header cells render their background at depth 0 and their text at depth 1.
 * Keep highlight layers strictly between/above those fixed layers so scroll
 * re-rendering never depends on equal-depth insertion order.
 */
const headerHighlightDepthOffset = {
  background: 1.5,
  activeBar: 3,
} as const;

/**
 * Controls how header highlighting is computed.
 *
 * - `selection-range`: highlight all row/column headers covered by the selection bounding box.
 * - `cross-active`: highlight only the active row and active column around the selection anchor.
 */
export type SheetHeaderHighlightMode = 'selection-range' | 'cross-active';

/**
 * Runtime configuration for header highlighting.
 *
 * These values are intentionally tuned for readability against default header colors.
 */
export const sheetHeaderHighlightPluginConfig = {
  /** Header highlight background color: slightly darkened neutral gray (no blue tint). */
  headerHighlightBackgroundColor: 'rgba(220, 222, 228, 1)',
  /**
   * Header highlight separator color must be one step darker than
   * `headerHighlightBackgroundColor`, otherwise row/column separators can visually disappear.
   *
   * The default header border (`rgba(220,221,229,1)`) differs from the highlight background
   * by only 1-2 color levels, which is often not enough contrast in highlighted areas.
   * This value intentionally uses a darker neutral gray for clearer separation.
   */
  headerHighlightBorderColor: 'rgba(189, 192, 201, 1)',
  /** Emphasis line color (the blue bar facing the grid). */
  headerHighlightActiveBorderColor: 'rgba(56, 110, 246, 1)',
  /** Emphasis line thickness in px (the blue bar facing the grid). */
  headerHighlightActiveBarThickness: 2,
  /** Logical header height used for column-header overlay rectangles. */
  columnHeaderHeight: 24,
  /** Highlight behavior mode. */
  mode: 'selection-range' as SheetHeaderHighlightMode,
};

/**
 * Plugin-local state shape.
 *
 * This plugin is render-driven and currently does not persist extra state.
 */
interface ISheetHeaderHighlight {}

/**
 * Row-header / column-header selection highlight plugin.
 *
 * The plugin reads selection from DataEngine during render and uses AffixCell
 * nodes with explicit depths so highlights stay between header backgrounds,
 * header text and the primary selection box.
 */
@Injectable()
export class SheetHeaderHighlightPlugin extends Plugin<SearCoreSheet, CellProperties, ISheetHeaderHighlight> {
  /** DI token for resolving SheetHeaderHighlightPlugin. */
  public static readonly symbol: symbol = Symbol.for('SheetHeaderHighlightPlugin');
  /** Stable plugin key for SheetHeaderHighlightPlugin. */
  public static readonly pluginKey = key;

  /**
   * Base render depth for plugin-generated nodes.
   *
   * The plugin places highlight background at `depth + 1.5` and emphasis bars at `depth + 3`
   * to guarantee stable stacking relative to default header nodes.
   */
  public override depth: number = -1;

  /** @inheritdoc */
  public override interestedIn = [
    RectOTActionName.UpdateRect,
    MatrixOTActionName.ResizeRow,
    MatrixOTActionName.ResizeCol,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /** Creates a SheetHeaderHighlightPlugin instance. */
  constructor(
    @Inject(SheetSelectionPlugin.symbol)
    private readonly sheetSelectionPlugin: SheetSelectionPlugin,
    @Inject(SheetCornerPlugin.symbol)
    private readonly sheetCornerPlugin: SheetCornerPlugin,
  ) {
    super({
      key,
      state: {},
    });
  }

  /**
   * Registers plugin state into the host state store.
   */
  public registerState() {
    return { key: this.key, state: this.getState() };
  }

  /**
   * Returns plugin-specific configuration.
   *
   * This plugin currently reads config directly from `configEngine` during render.
   */
  public getPluginConfig(searCore: SearCoreSheet): null {
    return null;
  }

  /**
   * Registers default configuration for this plugin.
   */
  public override registerConfig() {
    return [
      {
        key: this.key,
        config: new ConfigUnit(sheetHeaderHighlightPluginConfig),
      },
    ];
  }

  /** Applies a transaction to SheetHeaderHighlightPlugin state. */
  public apply(pluginState: ISheetHeaderHighlight, _transaction: Transaction): ISheetHeaderHighlight {
    return pluginState;
  }

  /**
   * Builds highlight nodes for row and column headers based on current selection and mode.
   *
   * Rendering flow:
   * 1. Resolve selection state from `SheetSelectionPlugin`.
   * 2. Early-return when selection is empty.
   * 3. Resolve table dimensions and plugin config.
   * 4. Compose offsets to match header layout around the corner region.
   * 5. Delegate to range/cross mode builders.
   *
   * @param searCore Active core sheet instance.
   * @param offset World-space offset propagated by the render pipeline.
   * @returns Flat list of nodes to add into the stage for this frame.
   */
  public render(searCore: SearCoreSheet, offset: { x: number; y: number } = { x: 0, y: 0 }): Node<CellProperties>[] {
    const dataEngine = searCore.getDataEngine();

    const selectionState = dataEngine.getDataType<[RectRange, RectRange]>(this.sheetSelectionPlugin.pluginKey);
    if (!selectionState) return [];
    // Do not render when selection is empty ([-1,-1,-1,-1]).
    if (selectionState[1].shape.join('') === RectRange.Empty.join('')) return [];

    const dataState = readHeaderHighlightGeometry(dataEngine);
    if (!dataState) return [];

    const pluginConfig = searCore.configEngine.getPluginConfig(this.key) as typeof sheetHeaderHighlightPluginConfig;

    // Keep aligned with SheetGridPlugin.render:
    // - shift column headers by corner.width on x
    // - shift row headers by corner.height on y
    const cornerConfig = this.sheetCornerPlugin.getPluginConfig(searCore);
    const composedOffset = {
      x: offset.x + cornerConfig.width,
      y: offset.y + cornerConfig.height,
    };

    const mode: SheetHeaderHighlightMode = pluginConfig.mode ?? 'selection-range';
    // Header highlights are rendered as one node per row/column.  Always
    // intersect the selection with the shared viewport window before
    // building those nodes; a full-column selection can otherwise try to
    // allocate 1,048,576 row-header nodes.
    const viewport = computeViewportRange(
      searCore.renderEngine.scrollManager,
      dataState.rowSizes,
      dataState.columnSizes,
      offset,
    );

    if (mode === 'cross-active') {
      return this.buildByActiveCellCross(
        searCore,
        selectionState,
        dataState,
        pluginConfig,
        composedOffset,
        cornerConfig,
        viewport,
      );
    }
    return this.buildBySelectionRange(
      searCore,
      selectionState,
      dataState,
      pluginConfig,
      composedOffset,
      cornerConfig,
      viewport,
    );
  }

  /**
   * Range mode: highlight headers of all selected rows and columns.
   *
   * The selection bounding rect already includes merged-cell expansion,
   * so this method can derive a complete row/column span directly.
   *
   * @returns Header background nodes and emphasis-bar nodes for the selected span.
   */
  private buildBySelectionRange(
    searCore: SearCoreSheet,
    selectionState: [RectRange, RectRange],
    dataState: HeaderHighlightGeometry,
    pluginConfig: typeof sheetHeaderHighlightPluginConfig,
    offset: { x: number; y: number },
    cornerConfig: { width: number; height: number },
    viewport: ViewportRange,
  ): Node<CellProperties>[] {
    // Use expanded bounding rect (already includes merged-cell expansion).
    const bounding = selectionState[1];
    const anchor = bounding.getPoint(0);
    const focus = bounding.getPoint(1);

    const rowStart = Math.min(anchor[0], focus[0]);
    const rowEnd = Math.max(anchor[0], focus[0]);
    const colStart = Math.min(anchor[1], focus[1]);
    const colEnd = Math.max(anchor[1], focus[1]);

    // Selection state can transiently contain header-space coordinates (for example -1).
    // Clamp to data-space indices before querying row/column boundaries.
    const safeRowStart = Math.max(0, rowStart);
    const safeRowEnd = Math.max(0, rowEnd);
    const safeColStart = Math.max(0, colStart);
    const safeColEnd = Math.max(0, colEnd);

    const nodes: Node<CellProperties>[] = [];
    nodes.push(
      ...this.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        offset,
        cornerConfig,
        safeColStart,
        safeColEnd,
        true,
        void 0,
        viewport,
      ),
    );
    nodes.push(
      ...this.buildRowHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        offset,
        cornerConfig,
        safeRowStart,
        safeRowEnd,
        true,
        void 0,
        viewport,
      ),
    );
    return nodes;
  }

  /**
   * Cross mode (reserved): highlight row/column headers around the anchor cell.
   *
   * @returns Nodes for exactly one row-header strip and one column-header strip.
   */
  private buildByActiveCellCross(
    searCore: SearCoreSheet,
    selectionState: [RectRange, RectRange],
    dataState: HeaderHighlightGeometry,
    pluginConfig: typeof sheetHeaderHighlightPluginConfig,
    offset: { x: number; y: number },
    cornerConfig: { width: number; height: number },
    viewport: ViewportRange,
  ): Node<CellProperties>[] {
    const anchor = selectionState[0].getPoint(0);
    const row = anchor[0];
    const col = anchor[1];
    if (row < 0 || col < 0) return [];

    const nodes: Node<CellProperties>[] = [];
    nodes.push(
      ...this.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        offset,
        cornerConfig,
        col,
        col,
        true,
        void 0,
        viewport,
      ),
    );
    nodes.push(
      ...this.buildRowHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        offset,
        cornerConfig,
        row,
        row,
        true,
        void 0,
        viewport,
      ),
    );
    return nodes;
  }

  /**
   * Builds column-header highlight nodes for a closed column interval.
   *
   * For each covered column this method emits:
   * - one background AffixCell strip in header area
   * - one optional emphasis bar at the bottom edge of the full selected width
   *
   * @param colStart Inclusive start column index.
   * @param colEnd Inclusive end column index.
   */
  private buildColumnHeaderHighlight(
    searCore: SearCoreSheet,
    dataState: HeaderHighlightGeometry,
    pluginConfig: typeof sheetHeaderHighlightPluginConfig,
    offset: { x: number; y: number },
    cornerConfig: { width: number; height: number },
    colStart: number,
    colEnd: number,
    drawActiveBar: boolean = true,
    activeBarThicknessOverride?: number,
    viewport?: ViewportRange,
  ): Node<CellProperties>[] {
    if (colStart < 0 || colEnd < 0 || colStart > colEnd) return [];

    const visibleRange = viewport
      ? this.intersectRange(colStart, colEnd, viewport.startCol, viewport.endCol)
      : ([colStart, colEnd] as const);
    if (!visibleRange) return [];
    [colStart, colEnd] = visibleRange;

    const { columnSizes } = dataState;
    const { renderCoordinatorManager } = searCore.renderEngine;

    // Column header strip is on top: y aligns with corner top, height = corner.height.
    const headerY = 0;
    const headerHeight = cornerConfig.height;

    const nodes: Node<CellProperties>[] = [];

    for (let i = colStart; i <= colEnd; i++) {
      // x is already shifted by offset.x (= input offset.x + corner.width).
      const x = columnSizes.getDimensionLeftBoundaryByIndex(i);
      const width = columnSizes.getItem(0, i) || 0;
      if (!width) continue;

      const positionRect = {
        x: x + offset.x,
        y: headerY,
        width,
        height: headerHeight,
      };

      // Highlight background (fill only, no nested text node).
      // Key: keep depth aligned with default column-header background (0), so header text
      // (AffixTextNode, depth=1) remains visible above this layer.
      // Also avoid passing `value` here: creating child AffixTextNode under AffixNode can
      // produce orphaned nodes during rerender (not tracked by markRemovePluginNode),
      // which may throw in TextNode.drawScene and interrupt later rendering.
      const bgCell = renderCoordinatorManager.create({ type: AffixCell.symbol, value: null }, positionRect, {
        type: AffixCell.symbol,
        top: 0,
        fill: pluginConfig.headerHighlightBackgroundColor,
        stroke: pluginConfig.headerHighlightBorderColor,
        horizontalAlign: SheetHorizontalAlignment.Center,
        depth: this.depth + headerHighlightDepthOffset.background,
        skipHit: true,
      });
      const bg = bgCell?.render();
      if (bg) nodes.push(...[bg].flat());
    }

    // Emphasis line (only at the bottom edge of selected columns):
    // a blue strip along the column-header bottom edge.
    if (drawActiveBar && colEnd >= colStart) {
      const xStart = columnSizes.getDimensionLeftBoundaryByIndex(colStart);
      const xEnd = columnSizes.getDimensionRightBoundaryByIndex(colEnd);
      const barWidth = xEnd - xStart;
      const thickness = Math.max(1, activeBarThicknessOverride ?? pluginConfig.headerHighlightActiveBarThickness);
      if (barWidth > 0 && thickness > 0) {
        // Shift 1px toward the grid so the header indicator line tightly joins
        // the primary selection border without a visible gap.
        const barRect = {
          x: xStart + offset.x,
          y: headerY + headerHeight - thickness + 1,
          width: barWidth,
          height: thickness,
        };
        const activeCell = renderCoordinatorManager.create({ type: AffixCell.symbol, value: null }, barRect, {
          type: AffixCell.symbol,
          top: 0,
          fill: pluginConfig.headerHighlightActiveBorderColor,
          stroke: 'transparent',
          horizontalAlign: SheetHorizontalAlignment.Center,
          depth: this.depth + headerHighlightDepthOffset.activeBar,
          skipHit: true,
        });
        const active = activeCell?.render();
        if (active) nodes.push(...[active].flat());
      }
    }

    return nodes;
  }

  /**
   * Builds row-header highlight nodes for a closed row interval.
   *
   * For each covered row this method emits:
   * - one background AffixCell strip in row-header area
   * - one optional emphasis bar along the right edge of the full selected height
   *
   * @param rowStart Inclusive start row index.
   * @param rowEnd Inclusive end row index.
   */
  private buildRowHeaderHighlight(
    searCore: SearCoreSheet,
    dataState: HeaderHighlightGeometry,
    pluginConfig: typeof sheetHeaderHighlightPluginConfig,
    offset: { x: number; y: number },
    cornerConfig: { width: number; height: number },
    rowStart: number,
    rowEnd: number,
    drawActiveBar: boolean = true,
    activeBarThicknessOverride?: number,
    viewport?: ViewportRange,
  ): Node<CellProperties>[] {
    if (rowStart < 0 || rowEnd < 0 || rowStart > rowEnd) return [];

    const visibleRange = viewport
      ? this.intersectRange(rowStart, rowEnd, viewport.startRow, viewport.endRow)
      : ([rowStart, rowEnd] as const);
    if (!visibleRange) return [];
    [rowStart, rowEnd] = visibleRange;

    const { rowSizes } = dataState;
    const { renderCoordinatorManager } = searCore.renderEngine;

    // Row-header strip is on the left: x aligns with corner left, width = corner.width.
    const headerX = 0;
    const headerWidth = cornerConfig.width;

    const nodes: Node<CellProperties>[] = [];

    for (let i = rowStart; i <= rowEnd; i++) {
      // y is already shifted by offset.y (= input offset.y + corner.height).
      const y = rowSizes.getDimensionLeftBoundaryByIndex(i);
      const height = rowSizes.getItem(0, i) || 0;
      if (!height) continue;

      const positionRect = {
        x: headerX,
        y: y + offset.y,
        width: headerWidth,
        height,
      };

      // Same handling as column headers; see comments in buildColumnHeaderHighlight.
      const bgCell = renderCoordinatorManager.create({ type: AffixCell.symbol, value: null }, positionRect, {
        type: AffixCell.symbol,
        left: 0,
        fill: pluginConfig.headerHighlightBackgroundColor,
        stroke: pluginConfig.headerHighlightBorderColor,
        horizontalAlign: SheetHorizontalAlignment.Center,
        depth: this.depth + headerHighlightDepthOffset.background,
        skipHit: true,
      });
      const bg = bgCell?.render();
      if (bg) nodes.push(...[bg].flat());
    }

    // Emphasis line: blue strip along the right edge of row headers across selected rows.
    if (drawActiveBar && rowEnd >= rowStart) {
      const yStart = rowSizes.getDimensionLeftBoundaryByIndex(rowStart);
      const yEnd = rowSizes.getDimensionRightBoundaryByIndex(rowEnd);
      const barHeight = yEnd - yStart;
      const thickness = Math.max(1, activeBarThicknessOverride ?? pluginConfig.headerHighlightActiveBarThickness);
      if (barHeight > 0 && thickness > 0) {
        // Shift 1px toward the grid so the header indicator line tightly joins
        // the primary selection border without a visible gap.
        const barRect = {
          x: headerX + headerWidth - thickness + 1,
          y: yStart + offset.y,
          width: thickness,
          height: barHeight,
        };
        const activeCell = renderCoordinatorManager.create({ type: AffixCell.symbol, value: null }, barRect, {
          type: AffixCell.symbol,
          left: 0,
          fill: pluginConfig.headerHighlightActiveBorderColor,
          stroke: 'transparent',
          horizontalAlign: SheetHorizontalAlignment.Center,
          depth: this.depth + headerHighlightDepthOffset.activeBar,
          skipHit: true,
        });
        const active = activeCell?.render();
        if (active) nodes.push(...[active].flat());
      }
    }

    return nodes;
  }

  /** Returns the closed interval shared by a selection and the visible window. */
  private intersectRange(
    start: number,
    end: number,
    visibleStart: number,
    visibleEnd: number,
  ): readonly [number, number] | null {
    const clippedStart = Math.max(start, visibleStart);
    const clippedEnd = Math.min(end, visibleEnd);
    return clippedStart <= clippedEnd ? [clippedStart, clippedEnd] : null;
  }
}
