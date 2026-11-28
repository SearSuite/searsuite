import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { EventRenderStrategy } from '../src/EventRenderStrategy';
import { createDirtyTracker, createRenderContext, createScrollManager, createTree } from './testFactories';
import './testSetup';

function asNode(value: object): Node<NodeProperties> {
  return value as unknown as Node<NodeProperties>;
}

describe('EventRenderStrategy', () => {
  const createStrategy = (): EventRenderStrategy<NodeProperties> => {
    const args = [
      createRenderContext(),
      createRenderContext(),
      createRenderContext(),
      createScrollManager(),
      {},
      {},
      createTree(),
      createDirtyTracker(),
    ] as unknown as ConstructorParameters<typeof EventRenderStrategy<NodeProperties>>;
    return new EventRenderStrategy<NodeProperties>(...args);
  };

  it('returns render context from getContext', () => {
    const strategy = createStrategy();

    expect(strategy.getContext()).toBe(strategy.renderContext);
  });

  it('keeps render as a no-op for event layer', () => {
    const strategy = createStrategy();

    expect(() => strategy.render(asNode({}))).not.toThrow();
  });

  it('throws for coordinate lookup because hit lookup belongs to HitRenderStrategy', () => {
    const strategy = createStrategy();

    expect(() => strategy.getNodeByCoordinates(asNode({}), 10, 20)).toThrow(
      'EventRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for event-layer hit lookup.',
    );
  });
});
