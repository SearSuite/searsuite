import { CursorRegistry, CursorEngine, CursorToken, SheetCursorPlugin } from '../src';
import { RenderContext } from '@searsuite/sear-render-context';
import { CoordinateEngine } from '@searsuite/sear-render-coord';

describe('SheetCursorPlugin', () => {
  it('implements plugin contract completely', () => {
    const registry = new CursorRegistry();
    const engine = { mount: jest.fn(), apply: jest.fn() } as unknown as CursorEngine;
    const renderContext = { getRenderTarget: jest.fn().mockReturnValue({}) } as unknown as RenderContext;
    const coordinates = {
      screenToView: jest.fn((x: number, y: number) => ({ x, y })),
      screenToWorld: jest.fn((x: number, y: number) => ({ x: x + 10, y: y + 20 })),
    } as unknown as CoordinateEngine;

    const plugin = new SheetCursorPlugin(registry, engine, coordinates, renderContext);

    expect(plugin.apply({}, {} as any)).toBeNull();
    expect(plugin.getPluginConfig()).toEqual({});
    expect(plugin.render()).toBeNull();
    expect(plugin.registerState()).toEqual({ key: expect.any(Object), state: {} });

    // onMouseMove with valid target properties
    plugin.onMouseMove({} as any, {
      origin: {} as any,
      target: { properties: { type: 'string' } } as any,
    });
    expect(engine.apply).toHaveBeenCalledWith(CursorToken.Default);

    // onMouseMove with invalid or missing properties
    plugin.onMouseMove({} as any, {
      origin: {} as any,
      target: null,
    });
    expect(engine.apply).toHaveBeenCalledWith(CursorToken.Default);
  });
});
