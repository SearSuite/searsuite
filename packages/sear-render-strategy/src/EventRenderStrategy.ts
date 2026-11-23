import { SearError } from '@searsuite/sear-foundation-error';
import { NodeProperties, Node } from '@searsuite/sear-render-node';
import { RenderContext } from '@searsuite/sear-render-context';

import { RenderStrategy } from './RenderStrategy';
import { Injectable } from '@searsuite/sear-foundation-di';

/**
 * Render strategy dedicated to event-layer integration.
 *
 * This strategy currently acts as a placeholder extension point. It shares the
 * same contract as all render strategies so event visualization can be added
 * later without changing orchestration code.
 *
 * @template NodeTypeProperties Node property shape used by the render tree.
 */
@Injectable()
export class EventRenderStrategy<NodeTypeProperties extends NodeProperties> extends RenderStrategy<NodeTypeProperties> {
  /** DI token for resolving EventRenderStrategy. */
  public static readonly symbol = Symbol.for('EventRenderStrategy');

  /**
   * Executes event-layer rendering.
   *
   * Current implementation is intentionally a no-op.
   */
  render(node: Node<NodeTypeProperties>): void {
    // console.log('EventRenderStrategy execution started');
  }

  /**
   * Returns the context used by this strategy.
   */
  getContext(): RenderContext {
    return this.renderContext;
  }

  /**
   * Event-layer hit lookup is not implemented yet.
   *
   * @throws Error Always thrown until this API is implemented.
   */
  getNodeByCoordinates(node: Node<NodeTypeProperties>, x: number, y: number): Node<NodeTypeProperties>[] {
    throw new SearError('EventRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for event-layer hit lookup.');
  }
}
