import { RenderStrategyManager } from '../src/RenderStrategyManager';
import { type RenderStrategy } from '../src/RenderStrategy';
import { type NodeProperties } from '@searsuite/sear-render-node';
import { type RenderContext } from '@searsuite/sear-render-context';

function asStrategy(value: object): RenderStrategy<NodeProperties> {
  return value as unknown as RenderStrategy<NodeProperties>;
}

function asRenderContext(value: object): RenderContext {
  return value as unknown as RenderContext;
}

describe('RenderStrategyManager', () => {
  it('adds and retrieves strategies by string key', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    const strategy = asStrategy({ id: 'screen' });

    manager.addStrategy('screen', strategy);

    expect(manager.getStrategy('screen')).toBe(strategy);
  });

  it('supports symbol keys and replacement', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    const key = Symbol('hit');
    const strategyA = asStrategy({ id: 'A' });
    const strategyB = asStrategy({ id: 'B' });

    manager.addStrategy(key, strategyA);
    manager.addStrategy(key, strategyB);

    expect(manager.getStrategy(key)).toBe(strategyB);
  });

  it('returns all strategies in insertion order', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    const s1 = asStrategy({ id: 1 });
    const s2 = asStrategy({ id: 2 });

    manager.addStrategy('first', s1);
    manager.addStrategy('second', s2);

    expect(manager.getAllStrategy()).toEqual([s1, s2]);
  });

  it('returns undefined for unknown keys', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    expect(manager.getStrategy('unknown')).toBeUndefined();
  });

  it('applies scale once to every distinct context contributed by strategies', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    const sharedContext = { setViewScale: jest.fn() };
    const extraContext = { setViewScale: jest.fn() };

    manager.addStrategy(
      'screen',
      asStrategy({
        getViewScaleContexts: () => [asRenderContext(sharedContext)],
      }),
    );
    manager.addStrategy(
      'extension',
      asStrategy({
        getViewScaleContexts: () => [asRenderContext(sharedContext), asRenderContext(extraContext)],
      }),
    );

    manager.setViewScale(1.25);

    expect(sharedContext.setViewScale).toHaveBeenCalledTimes(1);
    expect(sharedContext.setViewScale).toHaveBeenCalledWith(1.25);
    expect(extraContext.setViewScale).toHaveBeenCalledWith(1.25);
  });

  it('inserts strategies around references, replaces an existing insertion key, and rejects missing references', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    const first = asStrategy({ id: 'first' });
    const middle = asStrategy({ id: 'middle' });
    const last = asStrategy({ id: 'last' });
    const replacement = asStrategy({ id: 'replacement' });

    manager.addStrategy('first', first);
    manager.addStrategy('last', last);
    manager.addStrategyBefore('last', 'middle', middle);
    expect(manager.getAllStrategy()).toEqual([first, middle, last]);
    manager.addStrategyAfter('first', 'middle', replacement);
    expect(manager.getAllStrategy()).toEqual([first, replacement, last]);
    expect(() => manager.addStrategyBefore('missing', 'x', first)).toThrow('is not registered');
    expect(() => manager.addStrategyAfter('missing', 'x', first)).toThrow('is not registered');
  });
});
