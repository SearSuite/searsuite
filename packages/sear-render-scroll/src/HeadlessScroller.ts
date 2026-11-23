import { Injectable } from '@searsuite/sear-foundation-di';
import { type ScrollPublisher } from './ScrollManager';
import { Scroller } from './Scroller';

/** Scroller adapter for hosts that have no native scroll surface. */
@Injectable()
export class HeadlessScroller extends Scroller {
  /** DI token for resolving HeadlessScroller. */
  public static readonly symbol: symbol = Symbol.for('HeadlessScroller');

  /** Returns the publisher. */
  public getPublisher(): ScrollPublisher {
    return function publishHeadlessScroll(): () => void {
      return function unsubscribeHeadlessScroll(): void {};
    };
  }
}
