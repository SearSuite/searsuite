import { type SearCoreSheet } from './SearCoreSheet';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-domain-sheet';
import { type SheetConfig } from '@searsuite/sear-assembly-config';

/** Maintains logical viewport bounds without constructing or visiting a scene. */
export function updateSheetContentBoundary(core: SearCoreSheet): void {
  const rowSizes = readSheetRowSizes(core.dataEngine);
  const columnSizes = readSheetColumnSizes(core.dataEngine);
  if (!rowSizes || !columnSizes) return;
  const totalWidth = columnSizes.getDimensionRightBoundaryByIndex(columnSizes.shape[1] - 1);
  const totalHeight = rowSizes.getDimensionRightBoundaryByIndex(rowSizes.shape[1] - 1);
  const [viewportWidth, viewportHeight] = core.renderEngine.scrollManager.getShape();
  // Set ScrollManager content boundary so that update() clamps correctly.
  // Scroll offsets are measured in sheet-content coordinates, while the
  // viewport also contains sticky row/column headers.
  const defaultConfig = core.configEngine.getDefaultConfig() as SheetConfig;
  const sheetOffsetX = defaultConfig.sheetOffsetX;
  const sheetOffsetY = defaultConfig.sheetOffsetY;
  const viewportContentWidth = Math.max(viewportWidth - sheetOffsetX, 0);
  const viewportContentHeight = Math.max(viewportHeight - sheetOffsetY, 0);
  core.renderEngine.scrollManager.setContentBoundary(
    Math.max(totalWidth - viewportContentWidth, 0),
    Math.max(totalHeight - viewportContentHeight, 0),
  );
}
