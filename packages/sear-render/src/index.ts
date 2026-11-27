/**
 * Public rendering facade that composes contexts, nodes, strategies, and registries.
 *
 * @packageDocumentation
 */

/**
 * @guideChapter 5 rendering Render
 * @guideBody
 * `sear-render-*` defines scene, drawing, input, and viewport contracts for visual editors. Host adapters implement
 * platform-specific painting and event handling against those contracts.
 *
 * `RenderContext` exposes immediate drawing operations using platform-neutral values. Each visual host implements this
 * interface with its own rendering backend. Retained scene nodes, cell render registries, dirty-region strategies, hit
 * testing, cursor policy, input routing, and scrolling are separate concerns with their own contracts.
 *
 * For example, a render strategy uses the same `RenderContext` calls regardless of the host's drawing backend:
 *
 * ```ts
 * context.setFillStyle('#00a870');
 * context.beginPath();
 * context.rect(x, y, width, height);
 * context.fill();
 * ```
 *
 * `TextShaper` returns glyph, cluster, caret-stop, and advance data using UTF-16 offsets. Native text-system values
 * remain inside their adapters. Each editor composition root registers one text shaper.
 *
 * ```ts
 * const shaped = textShaper.shape({ text: 'Hello', font: '14px sans-serif' });
 * const width = shaped.width;
 * const caretPositions = shaped.caretStops;
 * ```
 *
 * `Platform` abstracts timers, event registration, resize observation, host-view offsets, identifiers, and warnings.
 * Reusable render packages depend on that contract rather than host globals, allowing different hosts to use the same
 * transaction and plugin layers.
 * For example, the scroll controller schedules its next frame with `platform.requestAnimationFrame()` rather than
 * calling a host-specific timer directly.
 *
 * ```ts
 * this.returnFrame = this.platform.requestAnimationFrame(this.runReturnFrame.bind(this));
 * ```
 */

export { SheetGridRender } from './sheet/SheetGridRender';
export { SheetGridView } from './sheet/SheetGrid';
export { activeFixedRowOffsets } from './sheet/SheetFreezeLayout';

export { SheetRowNumberView } from './sheet/SheetRowNumber';
export { SheetColumnLabelView } from './sheet/SheetColumnLabel';
export { SheetCornerView } from './sheet/corner/SheetCornerView';
export { SheetCellMergeRender } from './sheet/SheetCellMergeRender';
export { getSheetRangePositionRect, type SheetRangePositionContext } from './sheet/getSheetRangePositionRect';

export { computeViewportRange, type ViewportRange } from './ViewportRange';

export { SheetCursorView } from './sheet/cursor/SheetCursorView';
export {
  type SheetHeaderHighlightMode,
  sheetHeaderHighlightPluginConfig,
  SheetHeaderHighlightView,
} from './sheet/headerHighlight/SheetHeaderHighlightView';
export { SheetZoomSessionStateDefinition, sheetZoomPluginConfig, SheetZoomView } from './sheet/zoom/SheetZoomView';
export { SheetHighlightView } from './sheet/highlight/SheetHighlightView';
export { SheetFormulaReferenceHighlightView } from './sheet/formulaHighlight/SheetFormulaReferenceHighlightView';
export { SetSheetZoomCommand, ReadSheetZoomQuery, SheetZoomObservation } from './sheet/zoom/SheetZoomCommands';

export { SheetFormulaHyperlinkView } from './sheet/formulaHighlight/SheetFormulaHyperlinkView';

export {
  formulaHighlightViewKey,
  type FormulaReferenceColorPalette,
  type FormulaReferenceHighlightConfig,
  formulaReferenceHighlightConfig,
  getFormulaReferenceColor,
} from './sheet/formulaHighlight/FormulaHighlightConfig';

export { createBuiltinSheetCellView } from './sheet/registerBuiltinSheetRenderers';

export { SheetResizeView, type SheetResizeProjectedCells } from './sheet/resize/SheetResizeView';
export {
  registerSheetResizeDragCommands,
  type SheetResizeDragCommandController,
} from './sheet/resize/SheetResizeCommandRegistration';
export * from './sheet/resize/SheetResizeCommands';
export { SheetHistoryKeyboardView } from './sheet/history/SheetHistoryKeyboardView';

export * from './sheet/border/CellBorderLineNode';
export * from './sheet/border/renderCellBorders';
export * from './sheet/checkbox/CheckboxCell';
export * from './sheet/checkbox/CheckboxGlyphNode';
export * from './sheet/checkbox/CheckboxRenderContract';
export { SheetCellBorderView } from './sheet/border/SheetCellBorderView';
export { SheetCheckboxView, type SheetCheckboxViewOptions } from './sheet/checkbox/SheetCheckboxView';

export { registerSheetCellStyleView } from './sheet/visuals/registerSheetCellStyleView';

export { registerSheetFilterVisuals } from './sheet/visuals/registerSheetFilterVisuals';

export {
  SheetDataValidationView,
  type SheetDataValidationViewOptions,
} from './sheet/dataValidation/SheetDataValidationView';
export {
  numericValidationControlLayers,
  numericValidationControlValueAt,
} from './sheet/dataValidation/NumericValidationControlView';

export { SheetDropdownView, type SheetDropdownViewOptions } from './sheet/dropdown/SheetDropdownView';

export * from './sheet/selection/SheetRangeDrag';
export * from './sheet/selection/SheetRangeDragCommand';
export * from './sheet/selection/SheetSelectionPointerCommand';
export * from './sheet/selection/SheetSelectionRenderSemantics';
export * from './sheet/highlight/SheetHighlightRegistry';
export * from './sheet/highlight/SheetHighlightPipelineNames';
export * from './sheet/selection/createRangeMovePreview';
export * from './sheet/selection/SheetAxisDragView';
export * from './sheet/selection/SelectionViewCommands';
export * from './sheet/selection/SheetSelectionView';
export { resolveAxisInsertionBoundary } from './sheet/selection/resolveAxisInsertionBoundary';

export * from './sheet/cellEditor/Highlighter';
export * from './sheet/cellEditor/FormulaReferenceHighlighter';
export * from './sheet/cellEditor/EditorCursorBlinker';
export * from './sheet/cellEditor/computeCellEditorOverflowLeftX';
export * from './sheet/cellEditor/SheetCellEditorGeometry';
export * from './sheet/cellEditor/SheetCellEditorView';
export * from './sheet/cellEditor/SheetCellEditorViewCommands';
