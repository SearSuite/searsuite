import { Injectable } from '@searsuite/sear-foundation-di';
import { SearContractViolationError, SearLifecycleError } from '@searsuite/sear-assembly-plugin';
import { type SheetLifecycleContext, type SheetLifecycleController } from './SheetLifecycleController';

/** Starts and disposes the runtime controllers owned by one sheet instance. */
@Injectable()
export class SheetLifecycleCoordinator {
  /** DI token for resolving SheetLifecycleCoordinator. */
  public static readonly symbol = Symbol.for('SheetLifecycleCoordinator');

  readonly #controllers = new Set<SheetLifecycleController>();
  #context: SheetLifecycleContext | undefined;
  #destroyed = false;
  #assertCommandWrite: (() => void) | null = null;
  #teardownToken: object | null = null;
  #tearingDown = false;

  /** Closes runtime registration after editor assembly. */
  enforceCommandBoundary(assertCommandWrite: () => void, teardownToken: object): void {
    if (this.#assertCommandWrite)
      throw new SearContractViolationError('Sheet lifecycle boundary is already installed.');
    this.#assertCommandWrite = assertCommandWrite;
    this.#teardownToken = teardownToken;
  }

  /** Permits cleanup only for the owning editor. */
  beginTeardown(token: object): void {
    if (!this.#teardownToken || token !== this.#teardownToken) {
      throw new SearContractViolationError('Sheet lifecycle cleanup requires its editor owner.');
    }
    this.#tearingDown = true;
  }

  /**
   * Adds a controller. Controllers registered after startup begin immediately,
   * so applications can add lifecycle behavior without changing SearCoreSheet.
   */
  register(controller: SheetLifecycleController): () => void {
    if (this.#destroyed) {
      throw new SearLifecycleError(
        'register a controller',
        'destroyed',
        'Cannot register a controller after the sheet lifecycle is destroyed.',
      );
    }
    if (this.#tearingDown) throw new SearContractViolationError('Sheet lifecycle is being destroyed.');
    this.#assertCommandWrite?.();
    if (this.#controllers.has(controller)) {
      throw new SearLifecycleError(
        'register the same controller twice',
        'active',
        'Sheet lifecycle controller is already registered.',
      );
    }
    this.#controllers.add(controller);
    if (this.#context) controller.start(this.#context);

    const coordinator = this;
    return function unregisterSheetLifecycleController(): void {
      if (!coordinator.#controllers.has(controller)) return;
      if (!coordinator.#tearingDown) coordinator.#assertCommandWrite?.();
      coordinator.#controllers.delete(controller);
      controller.destroy();
    };
  }

  /** Starts SheetLifecycleCoordinator. */
  start(context: SheetLifecycleContext): void {
    if (this.#destroyed) {
      throw new SearLifecycleError('start', 'destroyed', 'Cannot start a destroyed sheet lifecycle.');
    }
    if (this.#context) return;
    this.#context = context;
    this.#controllers.forEach((controller) => controller.start(context));
  }

  /** Releases resources owned by SheetLifecycleCoordinator. */
  destroy(): void {
    if (this.#destroyed) return;
    if (this.#assertCommandWrite && !this.#tearingDown) {
      throw new SearContractViolationError('Sheet lifecycle destruction requires its editor owner.');
    }
    this.#destroyed = true;
    [...this.#controllers].reverse().forEach((controller) => controller.destroy());
    this.#context = void 0;
  }
}
