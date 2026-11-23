import './testSetup';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type RenderContext } from '@searsuite/sear-render-context';
import {
  BlockRasterCopyPlan,
  createViewportFrameCache,
  DirtyRegionCollector,
  RasterCopyExecutor,
  RasterCopyPlan,
  clearViewport,
  readRenderContextCapabilities,
  worldRectToViewportClearRect,
} from '../src';
import { createRenderContext } from './testFactories';

function asRenderContext(context: ReturnType<typeof createRenderContext>): RenderContext {
  return context as unknown as RenderContext;
}

describe('viewport raster runtime helpers', () => {
  it('collects and clears dirty regions from a host-provided source', () => {
    const rect = new PositionRect(10, 20, 30, 40);
    const source = {
      query: jest.fn(() => [rect]),
      getBoundary: jest.fn(() => new PositionRect(0, 0, 100, 100)),
      clear: jest.fn(),
    };
    const collector = new DirtyRegionCollector(source);

    expect(collector.collect()).toEqual([rect]);
    expect(source.query).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0, width: 100, height: 100 }));

    collector.clear();

    expect(source.clear).toHaveBeenCalledTimes(1);
  });

  it('creates expanded rectangle and union polygon dirty clips', () => {
    const dirty = new PositionRect(10, 10, 20, 20);
    const node = new PositionRect(0, 0, 40, 40);

    expect(DirtyRegionCollector.createClipRegion(dirty, node, 4, false)).toEqual(
      expect.objectContaining({ x: 8, y: 8, width: 24, height: 24 }),
    );
    expect(DirtyRegionCollector.createClipRegion(dirty, node, 4, true)).toEqual(
      expect.arrayContaining([expect.arrayContaining([-2, -2]), expect.arrayContaining([42, 42])]),
    );
  });

  it('plans cache copies and exposed redraw bounds from scroll deltas', () => {
    const plan = RasterCopyPlan.fromScroll(new PositionRect(0, 0, 200, 100), {
      x: 10,
      y: 20,
      deltaX: -15,
      deltaY: 12,
    });

    expect(plan.cacheToViewportCopy).toEqual({
      destination: { x: 0, y: 0, width: 200, height: 100 },
      source: { x: 15, y: -12, width: 200, height: 100 },
    });
    expect(plan.blankViewportRect).toEqual(expect.objectContaining({ x: 185, y: 0, width: 15, height: 12 }));
    expect(plan.blankWorldRect).toEqual(expect.objectContaining({ x: 195, y: 20, width: 15, height: 12 }));
  });

  it('plans clipped block raster copies from layout shifts', () => {
    const plan = BlockRasterCopyPlan.fromLayoutShift({
      viewport: new PositionRect(0, 0, 100, 60),
      scrollState: { x: 0, y: 10 },
      clearWorldRects: [{ x: 0, y: 5, width: 100, height: 80 }],
      copies: [
        {
          source: { x: 0, y: 20, width: 100, height: 20 },
          destination: { x: 0, y: 35, width: 100, height: 20 },
        },
        {
          source: { x: 0, y: 200, width: 100, height: 20 },
          destination: { x: 0, y: 200, width: 100, height: 20 },
        },
      ],
      invalidWorldRects: [{ x: 0, y: 5, width: 100, height: 20 }],
    });

    expect(plan?.clearViewportRects).toEqual([expect.objectContaining({ x: 0, y: 0, width: 100, height: 60 })]);
    expect(plan?.cacheToViewportCopies).toEqual([
      {
        source: { x: 0, y: 10, width: 100, height: 20 },
        destination: { x: 0, y: 25, width: 100, height: 20 },
      },
    ]);
    expect(plan?.invalidWorldRects).toEqual([expect.objectContaining({ x: 0, y: 10, width: 100, height: 15 })]);
  });

  it('skips block raster copy plans when no reusable copy intersects the viewport', () => {
    const plan = BlockRasterCopyPlan.fromLayoutShift({
      viewport: new PositionRect(0, 0, 100, 60),
      scrollState: { x: 0, y: 0 },
      clearWorldRects: [{ x: 0, y: 0, width: 100, height: 60 }],
      copies: [
        {
          source: { x: 0, y: 200, width: 100, height: 20 },
          destination: { x: 0, y: 200, width: 100, height: 20 },
        },
      ],
      invalidWorldRects: [{ x: 0, y: 0, width: 100, height: 20 }],
    });

    expect(plan).toBeNull();
  });

  it('honors non-origin viewport offsets when planning scroll copies', () => {
    const plan = RasterCopyPlan.fromScroll(new PositionRect(12, 16, 200, 100), {
      x: 30,
      y: 40,
      deltaX: -8,
      deltaY: 6,
    });

    expect(plan.cacheToViewportCopy).toEqual({
      destination: { x: 12, y: 16, width: 200, height: 100 },
      source: { x: 20, y: 10, width: 200, height: 100 },
    });
    expect(plan.blankViewportRect).toEqual(expect.objectContaining({ x: 204, y: 16, width: 8, height: 6 }));
  });

  it('executes raster copies and viewport clears with identity transforms', () => {
    const source = createRenderContext();
    const target = createRenderContext();
    const sourceTarget = {};
    source.getRenderTarget.mockReturnValue(sourceTarget);
    const executor = new RasterCopyExecutor();

    executor.copy(asRenderContext(source), asRenderContext(target), {
      source: { x: 1, y: 2, width: 3, height: 4 },
      destination: { x: 5, y: 6, width: 7, height: 8 },
    });
    clearViewport(asRenderContext(target), { x: 0, y: 0, width: 10, height: 20 });

    expect(target.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(target.drawImage).toHaveBeenCalledWith(sourceTarget, 5, 6, 7, 8, 1, 2, 3, 4);
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 10, 20);
  });

  it('primes and refreshes an off-screen viewport frame cache', () => {
    const visible = createRenderContext();
    const cache = createRenderContext();
    const visibleTarget = {};
    visible.getRenderTarget.mockReturnValue(visibleTarget);
    const frameCache = createViewportFrameCache(asRenderContext(cache), new RasterCopyExecutor());
    const viewport = { x: 0, y: 0, width: 50, height: 60 };

    expect(frameCache.isReady()).toBe(false);

    frameCache.primeFromVisibleFrame(asRenderContext(visible), viewport);

    expect(cache.clearRect).toHaveBeenCalledWith(0, 0, 50, 60);
    expect(cache.drawImage).toHaveBeenCalledWith(visibleTarget, 0, 0, 50, 60, 0, 0, 50, 60);
    expect(frameCache.isReady()).toBe(true);

    frameCache.refreshFromVisibleFrame(asRenderContext(visible), viewport);

    expect(cache.drawImage).toHaveBeenCalledWith(visibleTarget, 0, 0, 50, 60, 0, 0, 50, 60);

    frameCache.invalidate();

    expect(frameCache.isReady()).toBe(false);
  });

  it('reads capabilities and maps world dirty bounds into viewport clear bounds', () => {
    const context = createRenderContext();
    (context.requiresFrameRebuild as unknown as jest.Mock).mockReturnValue(true);
    (context.supportsDirtyRedraw as unknown as jest.Mock).mockReturnValue(false);
    (context.requiresExplicitNodeClear as unknown as jest.Mock).mockReturnValue(false);

    expect(readRenderContextCapabilities(asRenderContext(context))).toEqual({
      requiresFrameRebuild: true,
      supportsDirtyRedraw: false,
      requiresExplicitNodeClear: false,
    });
    expect(worldRectToViewportClearRect(new PositionRect(10, 20, 30, 40), 5, 6, 1)).toEqual(
      expect.objectContaining({ x: 4, y: 13, width: 32, height: 42 }),
    );
  });
});
