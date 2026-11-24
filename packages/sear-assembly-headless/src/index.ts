/**
 * Headless Sheet composition for tests, servers, and runtimes without a visual host.
 *
 * @packageDocumentation
 */

export {
  createHeadlessEditor,
  createHeadlessWorkbookEditor,
  type HeadlessEditor,
  type HeadlessEditorOptions,
  type HeadlessWorkbookEditor,
  type HeadlessWorkbookEditorOptions,
} from './createHeadlessEditor';
export { NodeXmlXPathEvaluator } from './NodeXmlXPathEvaluator';
export { NodeXmlDocumentParser } from './NodeXmlDocumentParser';
export { NodeXmlXPathEngine } from './NodeXmlXPathEngine';
