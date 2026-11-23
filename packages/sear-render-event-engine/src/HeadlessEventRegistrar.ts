import { Injectable } from '@searsuite/sear-foundation-di';
import { EventRegistrar } from './EventRegistrar';

/** Event registrar for hosts without a native event source. */
@Injectable()
export class HeadlessEventRegistrar extends EventRegistrar {
  /** DI token for resolving HeadlessEventRegistrar. */
  public static readonly symbol: symbol = Symbol.for('HeadlessEventRegistrar');
}
