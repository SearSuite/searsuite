import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';

/**
 * Owns cancellable subscriptions for one consumer instance.
 *
 * It centralizes disposal so viewport, DPR, visibility, network, and other
 * observers do not each need a dedicated cleanup field.
 */
@Injectable()
export class SubscriptionManager {
  /** DI token for resolving SubscriptionManager. */
  public static readonly symbol = Symbol.for('SubscriptionManager');

  private readonly disposers = new Set<() => void>();

  /** Creates a SubscriptionManager instance. */
  constructor(@Inject(Platform.symbol) private readonly platform: Platform) {}

  /** Observes host-view size changes and returns an idempotent disposer. */
  observeResize(target: unknown, callback: (size: { width: number; height: number }) => void): () => void {
    return this.track(this.platform.observeResize(target, callback));
  }

  /** Tracks an arbitrary subscription cleanup function and returns an idempotent disposer. */
  track(dispose: () => void): () => void {
    this.disposers.add(dispose);
    const manager = this;
    return function disposeTrackedSubscription(): void {
      if (!manager.disposers.delete(dispose)) return;
      dispose();
    };
  }

  /** Releases resources owned by SubscriptionManager. */
  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.clear();
  }
}
