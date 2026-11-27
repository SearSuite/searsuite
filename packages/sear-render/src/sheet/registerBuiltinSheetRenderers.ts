import { type CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { ViewExtensionRole, type ViewExtension } from '@searsuite/sear-render-event-engine';
import {
  AffixCell,
  BooleanCell,
  EditorCell,
  EmptyCell,
  FormulaCell,
  NumberCell,
  RichTextCell,
  StringCell,
  defineCellRenderer,
  type CellProperties,
  type SheetRenderCoordinatorManager,
} from '@searsuite/sear-render-registry';

/** Installs the default presentation of built-in cell types and view-only roles. */
export function createBuiltinSheetCellView(
  coordinator: SheetRenderCoordinatorManager,
  types: CellTypeCatalog,
): ViewExtension<unknown, CellProperties> {
  let dispose: (() => void) | undefined;
  return {
    [ViewExtensionRole]: true,
    key: new PluginKey('BuiltinSheetCellView'),
    initializeView() {
      dispose = registerBuiltinSheetRenderers(coordinator, types);
    },
    destroyView() {
      dispose?.();
      dispose = undefined;
    },
  };
}

function registerBuiltinSheetRenderers(coordinator: SheetRenderCoordinatorManager, types: CellTypeCatalog): () => void {
  const renderers = [
    defineCellRenderer(CellType.Empty, EmptyCell),
    defineCellRenderer(CellType.String, StringCell),
    defineCellRenderer(CellType.Number, NumberCell),
    defineCellRenderer(CellType.Boolean, BooleanCell),
    defineCellRenderer(CellType.RichText, RichTextCell),
    defineCellRenderer(CellType.Formula, FormulaCell),
    defineCellRenderer(AffixCell.symbol, AffixCell),
    defineCellRenderer(EditorCell.symbol, EditorCell),
  ];
  const disposers: Array<() => void> = [];
  try {
    for (const renderer of renderers) {
      disposers.push(
        coordinator.registerStoredValueValidator(
          renderer.cellType,
          (cell) => types.get(renderer.cellType)?.isStoredValue(cell) ?? true,
        ),
      );
      disposers.push(renderer.register(coordinator));
    }
  } catch (error) {
    disposers.reverse().forEach((dispose) => dispose());
    throw error;
  }
  return () => disposers.reverse().forEach((dispose) => dispose());
}
