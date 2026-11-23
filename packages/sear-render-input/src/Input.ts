import { EventListener } from '@searsuite/sear-render-node';

/**
 * Base class for host input adapters.
 *
 * Input adapters bridge platform events into the shared EventListener contract
 * and expose explicit listener lifecycle methods for assembly teardown.
 */
export abstract class Input extends EventListener {
  /** Starts listening to the host input source. */
  abstract startListener(): void;

  /** Stops listening to the host input source. */
  abstract stopListener(): void;
}
