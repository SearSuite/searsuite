/** Current stable workbook JSON format identifier. */
export const SearWorkbookFileFormat = 'searsuite.workbook';

/** JSON-compatible scalar or object value. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** One registered document-state module in a stable export file. */
export interface SearDocumentStateModuleFile {
  /** Stable module key owned by the state owner, such as `sheet.data`. */
  readonly key: string;
  /** Module-owned JSON payload. */
  readonly payload: JsonValue;
}

/** Stable persisted representation of one Sheet document state. */
export interface SearSheetDocumentFile {
  /** Sheet payload kind. */
  readonly kind: 'sheet';
  /** Registered document-state modules. */
  readonly modules: readonly SearDocumentStateModuleFile[];
}

/** Stable persisted representation of a Workbook document state. */
export interface SearWorkbookFile<TSheetDescriptor = JsonValue> {
  /** Stable file-format identifier. */
  readonly format: typeof SearWorkbookFileFormat;
  /** Persisted workbook document state. */
  readonly workbook: {
    readonly id: string;
    readonly sheets: readonly TSheetDescriptor[];
    readonly sheetStates: Readonly<Record<string, SearSheetDocumentFile>>;
    readonly metadata?: Readonly<Record<string, JsonValue>>;
    /** Stable cross-sheet formula targets, separate from displayed sheet names. */
    readonly formulaBindings?: readonly SearFormulaBindingFile[];
  };
}

/** One formula cell's workbook-qualified reference targets. */
export interface SearFormulaBindingFile {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
  readonly formula: string;
  readonly references: readonly { readonly sheetName: string; readonly sheetId: string }[];
}
