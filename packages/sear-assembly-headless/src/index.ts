/**
 * Headless Sheet composition for tests, servers, and runtimes without a visual host.
 *
 * @packageDocumentation
 */

export {
  createHeadlessEditor,
  createHeadlessWorkbookEditor,
  type HeadlessCalculationOptions,
  type HeadlessEditor,
  type HeadlessEditorOptions,
  type HeadlessHostOptions,
  type HeadlessWorkbookEditor,
  type HeadlessWorkbookEditorOptions,
} from './createHeadlessEditor';
export { NodeXmlDocumentParser } from './NodeXmlDocumentParser';
export { NodeXmlXPathEngine } from './NodeXmlXPathEngine';
export { NodeXmlXPathEvaluator } from './NodeXmlXPathEvaluator';

export {
  createHeadlessDocEditor,
  type HeadlessDocEditor,
  type HeadlessDocEditorOptions,
} from './createHeadlessDocEditor';
