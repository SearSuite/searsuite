import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import { EditorLifecycleStack } from '@searsuite/sear-assembly-plugin';
import { Container } from '@searsuite/sear-foundation-di';
import { prepareSheetKernel } from './SheetKernelAssembly';
import { type SheetKernelConfiguration } from './SheetKernelContracts';

/** Creates an isolated Sheet business editor without presentation services. */
export function createSheetKernelEditor(options: SheetKernelConfiguration): SheetEditor {
  const container = new Container(),
    lifecycle = new EditorLifecycleStack();
  lifecycle.add(() => container.reset());
  try {
    const assembly = prepareSheetKernel(container, lifecycle, options);
    assembly.initialize();
    assembly.start();
    assembly.seal();
    options.onCreated?.(assembly.editor);
    assembly.sealCommands();
    return assembly.editor;
  } catch (error) {
    try {
      lifecycle.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Sheet kernel setup and cleanup both failed.');
    }
    throw error;
  }
}
