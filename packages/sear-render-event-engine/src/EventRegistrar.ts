import { normalizeEventKey } from './EventNameUtils';
import { SearError } from '@searsuite/sear-foundation-error';

/** Base registry for event names supported by one host event adapter. */
export abstract class EventRegistrar {
  /** DI token for resolving the event registrar. */
  public static readonly symbol: symbol = Symbol.for('EventRegistrar');

  /** Normalized event names currently registered for dispatch. */
  public registeredEvents: string[] = [];
  #sealedEvents: readonly string[] | undefined;
  #assertWrite: (() => void) | undefined;

  /** Publishes a read-only event-name view after editor assembly. */
  public enforceCommandBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Event registrar boundary is already installed.');
    this.#sealedEvents = Object.freeze([...this.registeredEvents]);
    Object.defineProperty(this, 'registeredEvents', {
      configurable: false,
      get: () => this.#sealedEvents,
    });
    this.#assertWrite = assertWrite;
  }

  /**
   * Registers an event name after normalizing platform casing.
   * @param eventKey - Event name requested by a plugin.
   */
  register(eventKey: string): void {
    this.#assertWrite?.();
    const normalizedKey = normalizeEventKey(eventKey);
    if (!this.registeredEvents.includes(normalizedKey)) {
      if (this.#sealedEvents) this.#sealedEvents = Object.freeze([...this.#sealedEvents, normalizedKey]);
      else this.registeredEvents.push(normalizedKey);
    }
  }

  /**
   * Removes a registered event name.
   * @param eventKey - Event name requested by a plugin.
   */
  unregister(eventKey: string): void {
    this.#assertWrite?.();
    const normalizedKey = normalizeEventKey(eventKey);
    const idx = this.registeredEvents.indexOf(normalizedKey);
    if (idx !== -1) {
      if (this.#sealedEvents) this.#sealedEvents = Object.freeze(this.#sealedEvents.filter((key) => key !== normalizedKey));
      else this.registeredEvents.splice(idx, 1);
    }
  }
}
