import {
  DocumentStateCodecRegistry,
  ExportError,
  ExportErrorCode,
  readRecord,
  type DocumentStateModuleContribution,
  type SearSheetDocumentFile,
} from '@searsuite/sear-plugin-export';
import { SheetResizePlugin } from '@searsuite/sear-plugin-resize';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetAlignmentPlugin, SheetVerticalAlignmentPlugin } from '@searsuite/sear-plugin-alignment';
import { SheetCellFillPlugin } from '@searsuite/sear-plugin-cell-fill';
import { SheetCellHighlightPlugin } from '@searsuite/sear-plugin-cell-highlight';
import { DataValidationMatrix, SheetDataValidationPlugin } from '@searsuite/sear-plugin-data-validation';
import { SheetFilterMatrix, SheetFilterPlugin } from '@searsuite/sear-plugin-filter';
import { SheetCellBorderPlugin } from '@searsuite/sear-plugin-cell-border';
import { SheetDuplicatePlugin } from '@searsuite/sear-plugin-duplicate';
import { SheetCellFormatPlugin } from '@searsuite/sear-plugin-cell-format';
import { SheetFixedRowPlugin } from '@searsuite/sear-plugin-fixed-row';
import { SheetFreezePlugin } from '@searsuite/sear-plugin-freeze';

import { type SheetDocumentState } from './SheetDocumentState';

const DefaultSheetDocumentStateContributions = [
  SheetDataPlugin.documentState,
  SheetResizePlugin.documentState,
  SheetAlignmentPlugin.documentState,
  SheetVerticalAlignmentPlugin.documentState,
  SheetCellFillPlugin.documentState,
  SheetCellHighlightPlugin.documentState,
  SheetDataValidationPlugin.documentState,
  SheetFilterPlugin.documentState,
  SheetCellBorderPlugin.documentState,
  SheetDuplicatePlugin.documentState,
  SheetCellFormatPlugin.documentState,
  SheetFixedRowPlugin.documentState,
  SheetFreezePlugin.documentState,
  SheetCellMergePlugin.documentState,
].flat();

/** Creates the default registry for built-in Sheet document-state modules. */
export function createDefaultSheetDocumentStateExportRegistry(): DocumentStateCodecRegistry<SheetDocumentState> {
  const registry = new DocumentStateCodecRegistry<SheetDocumentState>();
  DefaultSheetDocumentStateContributions.forEach((contribution) =>
    registry.registerContribution(contribution as DocumentStateModuleContribution<unknown, object>),
  );
  return registry;
}

/** Serializes one Sheet document state through registered state-owner codecs. */
export function serializeSheetDocumentState<TSheetState extends SheetDocumentState = SheetDocumentState>(
  sheetState: TSheetState,
  registry: DocumentStateCodecRegistry<TSheetState> = createDefaultSheetDocumentStateExportRegistry() as DocumentStateCodecRegistry<TSheetState>,
): SearSheetDocumentFile {
  return {
    kind: 'sheet',
    modules: registry.serialize({
      ...sheetState,
      dataValidations:
        sheetState.dataValidations ??
        new DataValidationMatrix(void 0, [...sheetState.sheetData.shape] as [number, number]),
    } as TSheetState),
  };
}

/** Deserializes one Sheet document state through registered state-owner codecs. */
export function deserializeSheetDocumentState<TSheetState extends SheetDocumentState = SheetDocumentState>(
  payload: unknown,
  registry: DocumentStateCodecRegistry<TSheetState> = createDefaultSheetDocumentStateExportRegistry() as DocumentStateCodecRegistry<TSheetState>,
  path = 'sheet',
): TSheetState {
  const file = readSheetDocumentFile(payload, path);
  const partial = registry.deserialize(file.modules, path);
  return requireCompleteSheetDocumentState(partial, path);
}

function readSheetDocumentFile(payload: unknown, path: string): SearSheetDocumentFile {
  const record = readRecord(payload, path);
  if (record['kind'] !== 'sheet') {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Sheet payload kind must be "sheet".', {
      path: `${path}.kind`,
    });
  }
  if (!Array.isArray(record['modules'])) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Sheet modules must be an array.', {
      path: `${path}.modules`,
    });
  }
  return record as unknown as SearSheetDocumentFile;
}

export function requireCompleteSheetDocumentState<TSheetState extends SheetDocumentState>(
  partial: Partial<TSheetState>,
  path: string,
): TSheetState {
  const missing = [
    partial.sheetData === void 0 ? 'sheetData' : null,
    partial.rowSizes === void 0 ? 'rowSizes' : null,
    partial.columnSizes === void 0 ? 'columnSizes' : null,
    partial.cellAlignments === void 0 ? 'cellAlignments' : null,
    partial.cellVerticalAlignments === void 0 ? 'cellVerticalAlignments' : null,
    partial.cellFills === void 0 ? 'cellFills' : null,
    partial.cellHighlights === void 0 ? 'cellHighlights' : null,
    partial.duplicates === void 0 ? 'duplicates' : null,
    partial.cellFormats === void 0 ? 'cellFormats' : null,
    partial.cellMerges === void 0 ? 'cellMerges' : null,
  ].filter((field): field is string => field !== null);
  if (missing.length > 0) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Sheet document state is missing required modules.', {
      path,
      missing,
    });
  }
  const sheetData = partial.sheetData;
  const rowSizes = partial.rowSizes;
  const columnSizes = partial.columnSizes;
  const cellAlignments = partial.cellAlignments;
  const cellVerticalAlignments = partial.cellVerticalAlignments;
  const cellFills = partial.cellFills;
  const cellHighlights = partial.cellHighlights;
  const dataValidations = partial.dataValidations;
  const duplicates = partial.duplicates;
  const cellFormats = partial.cellFormats;
  const cellMerges = partial.cellMerges;
  if (
    !sheetData ||
    !rowSizes ||
    !columnSizes ||
    !cellAlignments ||
    !cellVerticalAlignments ||
    !cellFills ||
    !cellHighlights ||
    !duplicates ||
    !cellFormats ||
    !cellMerges
  ) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Sheet document state is missing required modules.', {
      path,
      missing,
    });
  }
  return {
    ...partial,
    sheetData,
    rowSizes,
    columnSizes,
    cellAlignments,
    cellVerticalAlignments,
    cellFills,
    cellHighlights,
    dataValidations: dataValidations ?? new DataValidationMatrix(void 0, [...sheetData.shape] as [number, number]),
    filters: partial.filters ?? new SheetFilterMatrix(),
    duplicates,
    cellFormats,
    cellMerges,
    ...(partial.rowHiddenOriginalSizes === void 0 ? {} : { rowHiddenOriginalSizes: partial.rowHiddenOriginalSizes }),
    ...(partial.columnHiddenOriginalSizes === void 0
      ? {}
      : { columnHiddenOriginalSizes: partial.columnHiddenOriginalSizes }),
    ...(partial.fixedRows === void 0 ? {} : { fixedRows: partial.fixedRows }),
    ...(partial.freeze === void 0 ? {} : { freeze: partial.freeze }),
  } as TSheetState;
}
