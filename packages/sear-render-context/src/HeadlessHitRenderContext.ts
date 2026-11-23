import { HeadlessRenderContext } from './HeadlessRenderContext';

/** Hit-test layer marker for a headless render pipeline. */
export class HeadlessHitRenderContext extends HeadlessRenderContext {
  /** DI token for resolving HeadlessHitRenderContext. */
  public static readonly symbol: symbol = Symbol.for('HeadlessHitRenderContext');
}
