import { Node, NodeProperties } from '@searsuite/sear-render-node';

/** Registry contract for mapping typed render inputs to scene nodes. */
export abstract class RendererRegistry<RegistryProperties extends NodeProperties> {
  /** DI token for resolving the active renderer registry. */
  public static readonly symbol: symbol = Symbol.for('RendererRegistry');

  /**
   * Registers a renderer function for one input type.
   * @param type - Type identifier owned by the cell or feature domain.
   * @param rendererFn - Function that converts input into scene nodes.
   * @returns Disposer that removes or restores the registration.
   */
  abstract registerRenderer(
    type: unknown,
    rendererFn: (input: unknown) => Node<RegistryProperties> | Node<RegistryProperties>[],
  ): () => void;

  /**
   * Renders a registered input.
   * @param input - Input accepted by the concrete registry implementation.
   * @returns Scene node or nodes produced by the registered renderer.
   */
  abstract render(input: unknown): Node<RegistryProperties> | Node<RegistryProperties>[];
}
