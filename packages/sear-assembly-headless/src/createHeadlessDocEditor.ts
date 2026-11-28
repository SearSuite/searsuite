import {
  createDocKernelEditor,
  type DocKernelConfiguration,
  type DocKernelEditor,
} from '@searsuite/sear-assembly-doc-kernel';
import { NodePlatform } from '@searsuite/sear-node-adapters';

/** Document business configuration with Node-owned platform services. */
export type HeadlessDocEditorOptions = Omit<DocKernelConfiguration, 'adapters'>;
/** The same independent document facade used by other hosts. */
export type HeadlessDocEditor = DocKernelEditor;

/** Creates a document business runtime without injecting empty presentation services. */
export function createHeadlessDocEditor(options: HeadlessDocEditorOptions): HeadlessDocEditor {
  return createDocKernelEditor({ ...options, adapters: { platform: NodePlatform } });
}
