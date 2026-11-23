import { HeadlessRenderContext } from './HeadlessRenderContext';

/** Off-screen layer marker for a headless render pipeline. */
export class HeadlessOffScreenRenderContext extends HeadlessRenderContext {
  /** DI token for resolving HeadlessOffScreenRenderContext. */
  public static readonly symbol: symbol = Symbol.for('HeadlessOffScreenRenderContext');
}
