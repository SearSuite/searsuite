import { SearError } from '@searsuite/sear-foundation-error';

/**
 * Represents an event listener system that allows adding, removing, and managing event handlers.
 * Supports default event types and allows extension with custom event types.
 */
export class EventListener<CustomEventTypes extends string = never> {
  /**
   * A record that maps event names to an array of event listener objects.
   * Each object contains the event name and the corresponding handler function.
   */
  readonly #eventListeners: Record<CustomEventTypes, Array<{ name: CustomEventTypes; handler: Function }>> =
    {} as Record<CustomEventTypes, Array<{ name: CustomEventTypes; handler: Function }>>;
  #assertWrite: (() => void) | undefined;
  #teardownToken: object | undefined;
  #tearingDown = false;
  #destroyed = false;

  /** Closes registration changes after an owning runtime has assembled. */
  public enforceWriteBoundary(assertWrite: () => void, teardownToken: object): void {
    if (this.#assertWrite) throw new SearError('Event listener write boundary is already installed.');
    this.#assertWrite = assertWrite;
    this.#teardownToken = teardownToken;
    for (const name of ['assertWriteAllowed', 'beginTeardown', 'finishTeardown'] as const) {
      Object.defineProperty(this, name, {
        value: EventListener.prototype[name], writable: false, configurable: false,
      });
    }
  }

  /** Allows the owning runtime to release listeners during teardown. */
  protected beginTeardown(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearError('Event cleanup requires its editor owner.');
    }
    this.#destroyed = true;
    this.#tearingDown = true;
  }

  protected finishTeardown(): void {
    this.#tearingDown = false;
  }

  protected assertWriteAllowed(): void {
    if (this.#tearingDown) return;
    if (this.#destroyed) throw new SearError('Event listeners have been destroyed.');
    this.#assertWrite?.();
  }

  /**
   * Registers an event handler for a specific event.
   * @param eventString - The name of the event to listen for.
   * @param handler - The function to be called when the event is triggered.
   * @returns The current instance to allow method chaining.
   */
  on(eventString: CustomEventTypes, handler: Function) {
    this.assertWriteAllowed();
    if (!this.#eventListeners[eventString]) this.#eventListeners[eventString] = [];

    this.#eventListeners[eventString].push({
      name: eventString,
      handler: handler,
    });

    return this;
  }

  /**
   * Removes event handlers for a specific event or all events.
   * @param eventString - The name of the event to remove handlers for. If not provided, all event handlers are removed.
   */
  off(eventString?: CustomEventTypes, handler?: Function) {
    if (this.#destroyed && !this.#tearingDown) return;
    this.assertWriteAllowed();
    if (!eventString) {
      for (let type in this.#eventListeners) {
        this.off(type as CustomEventTypes);
      }
    } else if (handler) {
      const listeners = this.#eventListeners[eventString];
      if (!listeners) return;
      const next = listeners.filter(function keepDifferentEventHandler(listener) {
        return listener.handler !== handler;
      });
      if (next.length > 0) this.#eventListeners[eventString] = next;
      else delete this.#eventListeners[eventString];
    } else {
      delete this.#eventListeners[eventString];
    }
  }

  /**
   * Triggers an event, calling all associated handlers in registration order.
   *
   * Propagation control:
   * If any handler synchronously returns `false`, dispatch to subsequent handlers stops.
   * Returning `true` / `undefined` / `void` means dispatch continues.
   *
   * This enables ordered plugin suppression for the same event (for example, a cell
   * editor can block a selection plugin on `dblClick`) without direct plugin-to-plugin
   * state mutation.
   *
   * @param eventString - The name of the event to trigger.
   * @param args - Arguments to pass to the event handlers.
   * @returns `false` if a handler actively stopped propagation; otherwise `true`.
   */
  emit(eventString: CustomEventTypes, ...args: unknown[]): boolean {
    const handlers = this.#eventListeners[eventString];
    if (!handlers) return true;
    for (const { handler } of handlers) {
      const result = handler(...args);
      if (result === false) return false;
    }
    return true;
  }
}
