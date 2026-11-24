import { SearError } from '@searsuite/sear-foundation-error';
import { Scroller } from './Scroller';

/** Factory registry for host scroller adapters. */
export class ScrollerFactory {
  /** Registered scroller creators keyed by host adapter type. */
  static #scrollerMap = new Map<string | symbol, (args: unknown) => Scroller>();

  /**
   * Registers a scroller creator.
   * @param type - Scroller type key.
   * @param scrollerCreator - Factory invoked by createScroller().
   */
  static registerScroller(type: string | symbol, scrollerCreator: (args: unknown) => Scroller): void {
    ScrollerFactory.#scrollerMap.set(type, scrollerCreator);
  }

  /**
   * Creates a scroller for a registered type.
   * @param type - Scroller type key.
   * @param args - Adapter-specific construction input.
   * @returns New scroller adapter.
   */
  static createScroller(type: string | symbol, args: unknown): Scroller {
    const scrollerCreator = ScrollerFactory.#scrollerMap.get(type);
    if (!scrollerCreator) {
      throw new SearError(`No scroller registered for type ${type.toString()}`);
    }
    return scrollerCreator(args);
  }
}
