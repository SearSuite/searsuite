import { SearCoreEditorAdapter } from './SearCoreEditorAdapter';
import type { SearCoreEditorAdapterOptions } from './SearCoreEditorAdapterOptions';

/** Creates the lightweight SearCore editor used by Sheet embedded cells. */
export function createSheetEmbeddedSearCoreEditor(options: SearCoreEditorAdapterOptions = {}): SearCoreEditorAdapter {
  return new SearCoreEditorAdapter(options);
}
