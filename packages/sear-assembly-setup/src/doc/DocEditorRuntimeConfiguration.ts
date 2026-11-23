import { type DocEditorContentRect, type DocEditorViewport } from './createDocEditor';

/** Immutable host configuration consumed by DI-owned standalone document runtime services. */
export interface DocEditorRuntimeConfiguration {
  readonly initialViewport: DocEditorViewport;
  readonly resolveContentRect: (viewport: DocEditorViewport) => DocEditorContentRect;
}

/** DI token for the standalone document runtime configuration snapshot. */
export const DocEditorRuntimeConfigurationSymbol = Symbol.for('DocEditorRuntimeConfiguration');
