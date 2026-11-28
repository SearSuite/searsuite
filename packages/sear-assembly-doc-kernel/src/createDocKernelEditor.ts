import { EditorLifecycleStack } from '@searsuite/sear-assembly-plugin';
import { Container } from '@searsuite/sear-foundation-di';
import { prepareDocKernel } from './DocKernelAssembly';
import { type DocKernelConfiguration, type DocKernelEditor } from './DocKernelContracts';

/** Creates an independent document editor with no scene, text shaper or native input. */
export function createDocKernelEditor(options: DocKernelConfiguration): DocKernelEditor {
  const container = new Container(),
    lifecycle = new EditorLifecycleStack();
  lifecycle.add(() => container.reset());
  try {
    const assembly = prepareDocKernel(container, lifecycle, options);
    assembly.initialize();
    assembly.start();
    assembly.seal();
    options.onCreated?.(assembly.editor);
    assembly.sealCommands();
    return assembly.editor;
  } catch (error) {
    try {
      lifecycle.dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Doc runtime setup and cleanup failed.');
    }
    throw error;
  }
}
