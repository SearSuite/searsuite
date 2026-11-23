import './testSetup';
import {
  DirtyRenderStrategy,
  DirtyRegionCollector,
  EventRenderStrategy,
  HitRenderStrategy,
  RasterCopyExecutor,
  RasterCopyPlan,
  RenderStrategy,
  RenderStrategyManager,
  ScreenRenderStrategy,
  StickyRenderStrategy,
  ViewportFrameCache,
  clearViewport,
  readRenderContextCapabilities,
} from '../src';
import { type RenderStrategy as RenderStrategyType } from '../src/RenderStrategy';
import { type NodeProperties } from '@searsuite/sear-render-node';

function asStrategy(value: object): RenderStrategyType<NodeProperties> {
  return value as unknown as RenderStrategyType<NodeProperties>;
}

describe('sear-render-strategy exports', () => {
  it('exports all strategy classes and manager', () => {
    expect(RenderStrategy).toBeDefined();
    expect(EventRenderStrategy).toBeDefined();
    expect(HitRenderStrategy).toBeDefined();
    expect(ScreenRenderStrategy).toBeDefined();
    expect(StickyRenderStrategy).toBeDefined();
    expect(DirtyRenderStrategy).toBeDefined();
    expect(DirtyRegionCollector).toBeDefined();
    expect(RasterCopyExecutor).toBeDefined();
    expect(RasterCopyPlan).toBeDefined();
    expect(RenderStrategyManager).toBeDefined();
    expect(ViewportFrameCache).toBeDefined();
    expect(clearViewport).toBeDefined();
    expect(readRenderContextCapabilities).toBeDefined();
  });

  it('works with manager registration workflow using exported symbols', () => {
    const manager = new RenderStrategyManager<NodeProperties>();
    const strategyLike = asStrategy({ name: 'screen' });

    manager.addStrategy(ScreenRenderStrategy.symbol, strategyLike);

    expect(manager.getStrategy(ScreenRenderStrategy.symbol)).toBe(strategyLike);
    expect(manager.getAllStrategy()).toEqual([strategyLike]);
  });
});
