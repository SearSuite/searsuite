import { ConfigEngine } from '@searsuite/sear-assembly-config';

/**
 * Base class for host scroll adapters.
 *
 * Concrete scrollers own platform scroll surfaces while ScrollManager owns the
 * platform-neutral viewport state.
 */
export abstract class Scroller {
  /** DI token for resolving the active scroller adapter. */
  public static readonly symbol: symbol = Symbol.for('Scroller');

  /** Configuration engine available to concrete scroller adapters. */
  public readonly configEngine!: ConfigEngine;

  /** DI token used by hosts that provide a scroller container. */
  public static readonly ContainerSymbol: symbol = Symbol.for('Scroller.Container');

  /** Constructs a scroller adapter. */
  constructor() {}
}
