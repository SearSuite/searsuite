import { SheetSelectionView } from '@searsuite/sear-render';
import { SheetCommandEffectRegistry } from '@searsuite/sear-assembly-commands';
import { SheetResizeView, SheetFormulaHyperlinkView, SheetHistoryKeyboardView } from '@searsuite/sear-render';
import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';

import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { FormulaCrossSheetHighlightSource } from '@searsuite/sear-plugin-formula';
import { SheetFormulaReferenceHighlightView } from '@searsuite/sear-render';
import { SheetHeaderHighlightView } from '@searsuite/sear-render';

import { SheetHighlightView } from '@searsuite/sear-render';
import { SheetZoomView } from '@searsuite/sear-render';
import { SheetCursorView } from '@searsuite/sear-render';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Registers interaction plugins that must start after formula services are available. */
export function registerSheetInteractionDecorationViews(container: Container): void {
  const views = container.resolve<ViewExtensionRegistry<SearCoreSheet, CellProperties>>(ViewExtensionRegistry.symbol);
  container.register(SheetFormulaHyperlinkView.symbol, SheetFormulaHyperlinkView, Scope.Singleton);
  views.register(container.resolve<SheetFormulaHyperlinkView>(SheetFormulaHyperlinkView.symbol));
  container.register(SheetHistoryKeyboardView.symbol, SheetHistoryKeyboardView, Scope.Singleton);
  views.register(container.resolve<SheetHistoryKeyboardView>(SheetHistoryKeyboardView.symbol));
  container.register(SheetCursorView.symbol, SheetCursorView, Scope.Singleton);
  views.register(container.resolve<SheetCursorView>(SheetCursorView.symbol));
  container.register(SheetResizeView.symbol, SheetResizeView, Scope.Singleton);
  const resizeView = container.resolve<SheetResizeView>(SheetResizeView.symbol);
  const formulaResults = container.resolve<IFormulaResultProvider>(IFormulaResultProvider.symbol);
  resizeView.setProjectedCells({
    forEachProjectedCellInRange(startRow, startColumn, endRow, endColumn, visit) {
      formulaResults.forEachFormulaResultInRange?.(startRow, startColumn, endRow, endColumn, (row, col) =>
        visit({ type: CellType.Formula }, row, col),
      );
    },
  });
  views.register(resizeView);
  container.register(SheetSelectionView.symbol, SheetSelectionView, Scope.Singleton);
  const selectionView = container.resolve<SheetSelectionView>(SheetSelectionView.symbol);
  selectionView.registerEffects(container.resolve<SheetCommandEffectRegistry>(SheetCommandEffectRegistry.symbol));
  views.register(selectionView);
  container.register(SheetZoomView.symbol, SheetZoomView, Scope.Singleton);
  views.register(container.resolve<SheetZoomView>(SheetZoomView.symbol));
  container.register(SheetHighlightView.symbol, SheetHighlightView, Scope.Singleton);
  views.register(container.resolve<SheetHighlightView>(SheetHighlightView.symbol));
  container.register(SheetFormulaReferenceHighlightView.symbol, SheetFormulaReferenceHighlightView, Scope.Singleton);
  const formulaHighlights = container.resolve<SheetFormulaReferenceHighlightView>(
    SheetFormulaReferenceHighlightView.symbol,
  );
  if (container.hasBinding(FormulaCrossSheetHighlightSource.symbol)) {
    formulaHighlights.bindCrossSheetSource(
      container.resolve<FormulaCrossSheetHighlightSource>(FormulaCrossSheetHighlightSource.symbol),
    );
  }
  views.register(formulaHighlights);
  container.register(SheetHeaderHighlightView.symbol, SheetHeaderHighlightView, Scope.Singleton);
  views.register(container.resolve<SheetHeaderHighlightView>(SheetHeaderHighlightView.symbol));
}
