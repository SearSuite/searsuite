import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { assertCellExtensionWrite } from '@searsuite/sear-domain-cell-types';
import { Node, NodeProperties } from '@searsuite/sear-render-node';

import { CellProperties, Cell } from './Cell';
import { RendererRegistry } from './RendererRegistry';

/** Renderer registry for sheet cell instances. */
@Injectable()
export class SheetRendererRegistry<
  RegistryProperties extends NodeProperties,
> extends RendererRegistry<RegistryProperties> {
  /** Renderer functions keyed by persisted or rendering-only cell type. */
  readonly #rendererMap = new Map<
    CellProperties['type'],
    <T extends CellProperties>(input: Cell<T>) => Node<RegistryProperties> | Node<RegistryProperties>[]
  >();

  /**
   * Registers a renderer for one sheet cell type.
   * @param type - Cell type identifier.
   * @param rendererFn - Function that renders matching cell instances.
   * @returns Disposer that restores the previous renderer.
   */
  override registerRenderer(
    type: CellProperties['type'],
    rendererFn: <T extends CellProperties>(input: Cell<T>) => Node<RegistryProperties> | Node<RegistryProperties>[],
  ): () => void {
    assertCellExtensionWrite(this);
    const previous = this.#rendererMap.get(type);
    this.#rendererMap.set(type, rendererFn);
    const registry = this;
    return function unregisterSheetRenderer(): void {
      assertCellExtensionWrite(registry);
      if (registry.#rendererMap.get(type) !== rendererFn) return;
      if (previous) registry.#rendererMap.set(type, previous);
      else registry.#rendererMap.delete(type);
    };
  }

  /**
   * Renders a cell through its registered renderer.
   * @param input - Cell instance to render.
   * @returns Scene node or nodes produced by the renderer.
   */
  render<T extends CellProperties>(input: Cell<T>): Node<RegistryProperties> | Node<RegistryProperties>[] {
    const type = input.data.type;
    const rendererFn = this.#rendererMap.get(type);
    if (!rendererFn) {
      throw new SearError(`No renderer registered for type: ${String(type)}`);
    }
    return rendererFn(input);
  }
}
