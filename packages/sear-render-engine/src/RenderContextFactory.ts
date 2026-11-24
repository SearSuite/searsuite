import { SearError } from '@searsuite/sear-foundation-error';
import { RenderContext } from '@searsuite/sear-render-context';

/** Factory registry for render-context implementations. */
export class RenderContextFactory {
  /** Registered context builders keyed by host or adapter type. */
  static #contextMap = new Map<string | symbol, (args: unknown) => RenderContext>();

  /**
   * Registers a render-context creator.
   * @param type - Context type key.
   * @param contextCreator - Factory invoked by createContext().
   */
  static registerContext(type: string | symbol, contextCreator: (args: unknown) => RenderContext): void {
    RenderContextFactory.#contextMap.set(type, contextCreator);
  }

  /**
   * Creates a render context for a registered type.
   * @param type - Context type key.
   * @param args - Adapter-specific construction input.
   * @returns New render context instance.
   */
  static createContext(type: string | symbol, args: unknown): RenderContext {
    const contextCreator = RenderContextFactory.#contextMap.get(type);
    if (!contextCreator) {
      throw new SearError(`No context registered for type ${type.toString()}`);
    }
    return contextCreator(args);
  }
}
