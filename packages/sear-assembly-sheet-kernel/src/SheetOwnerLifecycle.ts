import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

/** A business runtime concern with no presentation context. */
export interface SheetOwnerController {
  start(): void;
  destroy(): void;
}

/** Starts and releases the business controllers owned by one Sheet kernel. */
@Injectable()
export class SheetOwnerLifecycle {
  public static readonly symbol = Symbol.for('SheetOwnerLifecycle');
  readonly #controllers = new Set<SheetOwnerController>();
  #started = false;
  #destroyed = false;
  /** Registers a controller during composition only. */
  public register(controller: SheetOwnerController): void {
    if (this.#started || this.#destroyed)
      throw new SearError('Sheet owner controllers must be registered during composition.');
    if (this.#controllers.has(controller)) throw new SearError('Sheet owner controller is already registered.');
    this.#controllers.add(controller);
  }
  /** Starts every business controller after state initialization. */
  public start(): void {
    if (this.#started || this.#destroyed) return;
    this.#started = true;
    this.#controllers.forEach((controller) => controller.start());
  }
  /** Releases business subscriptions in reverse ownership order. */
  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const errors: unknown[] = [];
    for (const controller of [...this.#controllers].reverse())
      try {
        controller.destroy();
      } catch (error) {
        errors.push(error);
      }
    this.#controllers.clear();
    if (errors.length) throw new AggregateError(errors, 'Sheet owner cleanup failed.');
  }
}
