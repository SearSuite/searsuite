import {
  RenderContext,
  HeadlessRenderContext,
  HeadlessOffScreenRenderContext,
  HeadlessHitRenderContext,
  CoordinateTransformer,
} from '../src/index';

describe('index exports', () => {
  it('exports all expected modules', () => {
    expect(RenderContext).toBeDefined();
    expect(HeadlessRenderContext).toBeDefined();
    expect(HeadlessOffScreenRenderContext).toBeDefined();
    expect(HeadlessHitRenderContext).toBeDefined();
    expect(CoordinateTransformer).toBeDefined();
  });
});
