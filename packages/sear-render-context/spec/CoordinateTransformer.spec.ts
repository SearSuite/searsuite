import { CoordinateTransformer } from '../src/CoordinateTransformer';

describe('CoordinateTransformer', () => {
  const transformer = new CoordinateTransformer(
    { getState: () => ({ x: 20, y: 30 }), getShape: () => [400, 300] } as never,
    { getViewScale: () => 2 } as never,
    { getRasterScale: () => 4 } as never,
  );

  it('keeps world, view, and raster conversions distinct at non-100% zoom', () => {
    expect(transformer.viewToWorld({ x: 100, y: 60 })).toEqual({
      x: 70,
      y: 60,
    });
    expect(transformer.worldToView({ x: 70, y: 60 })).toEqual({
      x: 100,
      y: 60,
    });

    // View coordinates must not be zoomed again when reading the raster.
    expect(transformer.viewToRaster({ x: 100, y: 60 })).toEqual({
      x: 400,
      y: 240,
    });
  });
});
