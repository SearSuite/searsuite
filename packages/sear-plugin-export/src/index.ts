/**
 * Versioned export envelopes, document-state codec registries, and durable persistence boundaries.
 *
 * @packageDocumentation
 */

export { ExportError } from './ExportError';
export { ExportErrorCode, type ExportErrorCode as ExportErrorCodeValue } from './ExportErrorCode';
export {
  DocumentStateCodecRegistry,
  type DocumentStateCodec,
  type DocumentStateModuleContribution,
} from './DocumentStateCodecRegistry';
export { cloneJsonRecord, cloneJsonValue, readRecord } from './JsonPayload';
export {
  SearWorkbookFileFormat,
  type SearDocumentStateModuleFile,
  type JsonValue,
  type SearSheetDocumentFile,
  type SearWorkbookFile,
  type SearFormulaBindingFile,
} from './ExportTypes';
