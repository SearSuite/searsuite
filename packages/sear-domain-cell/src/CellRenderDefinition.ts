import { type CellRendererDefinition } from './CellRendererDefinition';

/** A rendering-only sheet cell definition, such as an editor overlay or header affix. */
export abstract class CellRenderDefinition {
  /** Stable type key for CellRenderDefinition. */
  abstract readonly type: string | symbol;

  /** Creates the renderer. */
  abstract createRenderer(): CellRendererDefinition;
}
