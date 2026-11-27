import {
  createDefaultSheetDocumentStateExportRegistry,
  deserializeSheetDocumentState,
  serializeSheetDocumentState,
  type SheetDocumentState,
} from '@searsuite/sear-assembly-sheet-state';
import {
  type WorkbookDocumentState,
  type WorkbookSheetDescriptor,
  validateWorkbookDocumentState,
} from '@searsuite/sear-domain-workbook';
import {
  DocumentStateCodecRegistry,
  ExportError,
  ExportErrorCode,
  SearWorkbookFileFormat,
  cloneJsonRecord,
  cloneJsonValue,
  readRecord,
  type SearWorkbookFile,
  type SearFormulaBindingFile,
} from '@searsuite/sear-plugin-export';
import { collectWorkbookFormulaBindings, WorkbookFormulaBindingsMetadataKey } from './WorkbookFormulaBindingEnvelope';

/** Options for workbook document-state serialization. */
export interface WorkbookDocumentStateSerializationOptions<
  TSheetState extends SheetDocumentState = SheetDocumentState,
> {
  /** Registry that owns Sheet document-state module serialization. */
  readonly sheetRegistry?: DocumentStateCodecRegistry<TSheetState>;
}

/** Serializes a workbook document state into the stable SearSuite JSON format. */
export function serializeWorkbookDocumentState<TSheetState extends SheetDocumentState = SheetDocumentState>(
  documentState: WorkbookDocumentState<TSheetState>,
  options: WorkbookDocumentStateSerializationOptions<TSheetState> = {},
): SearWorkbookFile<WorkbookSheetDescriptor> {
  validateWorkbookDocumentState(documentState);
  const sheetRegistry = options.sheetRegistry ?? createDefaultSheetDocumentStateExportRegistry();
  const sheetStates = Object.fromEntries(
    Object.entries(documentState.sheetStates).map(([sheetId, sheetState]) => [
      sheetId,
      serializeSheetDocumentState(sheetState as TSheetState, sheetRegistry as DocumentStateCodecRegistry<TSheetState>),
    ]),
  );
  const workbook: SearWorkbookFile<WorkbookSheetDescriptor>['workbook'] = {
    id: documentState.id,
    sheets: cloneJsonValue(documentState.sheets, 'workbook.sheets'),
    sheetStates,
  };
  const formulaBindings = collectWorkbookFormulaBindings(documentState);
  const { [WorkbookFormulaBindingsMetadataKey]: _runtimeBindings, ...metadata } = documentState.metadata ?? {};
  return {
    format: SearWorkbookFileFormat,
    workbook: {
      ...workbook,
      ...(Object.keys(metadata).length === 0
        ? {}
        : {
            metadata: cloneJsonRecord(metadata, 'workbook.metadata') as NonNullable<
              SearWorkbookFile<WorkbookSheetDescriptor>['workbook']['metadata']
            >,
          }),
      ...(formulaBindings.length === 0 ? {} : { formulaBindings }),
    },
  };
}

/** Deserializes a stable SearSuite JSON workbook file into runtime document state. */
export function deserializeWorkbookDocumentState<TSheetState extends SheetDocumentState = SheetDocumentState>(
  payload: unknown,
  options: WorkbookDocumentStateSerializationOptions<TSheetState> = {},
): WorkbookDocumentState<TSheetState> {
  const file = readWorkbookFile(payload);
  const sheetRegistry = options.sheetRegistry ?? createDefaultSheetDocumentStateExportRegistry();
  const documentState: WorkbookDocumentState<TSheetState> = {
    id: file.workbook.id,
    sheets: cloneJsonValue(file.workbook.sheets, 'workbook.sheets'),
    sheetStates: Object.fromEntries(
      Object.entries(file.workbook.sheetStates).map(([sheetId, sheetState]) => [
        sheetId,
        deserializeSheetDocumentState(
          sheetState,
          sheetRegistry as DocumentStateCodecRegistry<TSheetState>,
          `workbook.sheetStates.${sheetId}`,
        ) as TSheetState,
      ]),
    ),
  };
  if (file.workbook.metadata === void 0 && file.workbook.formulaBindings === void 0) {
    validateWorkbookDocumentState(documentState);
    return documentState;
  }
  const withMetadata: WorkbookDocumentState<TSheetState> = {
    ...documentState,
    metadata: {
      ...(file.workbook.metadata === void 0 ? {} : cloneJsonRecord(file.workbook.metadata, 'workbook.metadata')),
      ...(file.workbook.formulaBindings === void 0
        ? {}
        : {
            [WorkbookFormulaBindingsMetadataKey]: file.workbook.formulaBindings,
          }),
    } as NonNullable<WorkbookDocumentState<TSheetState>['metadata']>,
  };
  validateWorkbookDocumentState(withMetadata);
  return withMetadata;
}

function readWorkbookFile(payload: unknown): SearWorkbookFile<WorkbookSheetDescriptor> {
  const record = readRecord(payload, 'file');
  const format = record['format'];
  if (format !== SearWorkbookFileFormat) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Unsupported workbook file format.', {
      path: 'format',
      format,
    });
  }
  const workbook = readRecord(record['workbook'], 'workbook');
  const id = workbook['id'];
  const sheets = workbook['sheets'];
  const rawSheetStates = workbook['sheetStates'];
  const metadata = workbook['metadata'];
  const formulaBindings = workbook['formulaBindings'];
  if (typeof id !== 'string') {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Workbook id must be a string.', { path: 'workbook.id' });
  }
  if (!Array.isArray(sheets)) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Workbook sheets must be an array.', {
      path: 'workbook.sheets',
    });
  }
  const sheetStates = readRecord(rawSheetStates, 'workbook.sheetStates') as Readonly<
    Record<string, SearWorkbookFile<WorkbookSheetDescriptor>['workbook']['sheetStates'][string]>
  >;
  const result: SearWorkbookFile<WorkbookSheetDescriptor> = {
    format: SearWorkbookFileFormat,
    workbook: {
      id,
      sheets: cloneJsonValue(sheets, 'workbook.sheets') as WorkbookSheetDescriptor[],
      sheetStates,
    },
  };
  const bindings = formulaBindings === void 0 ? undefined : readFormulaBindings(formulaBindings);
  if (metadata === void 0 && bindings === void 0) return result;
  return {
    ...result,
    workbook: {
      ...result.workbook,
      ...(metadata === void 0
        ? {}
        : {
            metadata: cloneJsonRecord(
              metadata as Readonly<Record<string, unknown>>,
              'workbook.metadata',
            ) as NonNullable<SearWorkbookFile<WorkbookSheetDescriptor>['workbook']['metadata']>,
          }),
      ...(bindings === void 0 ? {} : { formulaBindings: bindings }),
    },
  };
}

function readFormulaBindings(payload: unknown): SearFormulaBindingFile[] {
  if (!Array.isArray(payload)) {
    throw new ExportError(ExportErrorCode.invalidFormat, 'Formula bindings must be an array.', {
      path: 'workbook.formulaBindings',
    });
  }
  return payload.map((item, index) => {
    const path = `workbook.formulaBindings.${index}`;
    const entry = readRecord(item, path);
    if (
      typeof entry['sheetId'] !== 'string' ||
      !Number.isSafeInteger(entry['row']) ||
      !Number.isSafeInteger(entry['col']) ||
      (entry['row'] as number) < 0 ||
      (entry['col'] as number) < 0 ||
      typeof entry['formula'] !== 'string' ||
      !Array.isArray(entry['references'])
    ) {
      throw new ExportError(ExportErrorCode.invalidFormat, 'Invalid formula binding.', { path });
    }
    const references = entry['references'].map((reference: unknown, refIndex: number) => {
      const value = readRecord(reference, `${path}.references.${refIndex}`);
      if (typeof value['sheetName'] !== 'string' || typeof value['sheetId'] !== 'string') {
        throw new ExportError(ExportErrorCode.invalidFormat, 'Invalid formula reference binding.', { path });
      }
      return { sheetName: value['sheetName'], sheetId: value['sheetId'] };
    });
    return {
      sheetId: entry['sheetId'] as string,
      row: entry['row'] as number,
      col: entry['col'] as number,
      formula: entry['formula'] as string,
      references,
    };
  });
}
