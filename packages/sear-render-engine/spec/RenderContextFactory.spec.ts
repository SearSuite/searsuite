import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { RenderContextFactory } from '../src';

describe('RenderContextFactory', () => {
  it('creates registered contexts and surfaces unknown registrations', () => {
    const key = Symbol('headless-render-context');
    const args = { scale: 2 };
    const creator = jest.fn(() => new HeadlessRenderContext());
    RenderContextFactory.registerContext(key, creator);

    expect(RenderContextFactory.createContext(key, args)).toBeInstanceOf(HeadlessRenderContext);
    expect(creator).toHaveBeenCalledWith(args);
    expect(() => RenderContextFactory.createContext(Symbol('missing'), null)).toThrow('No context registered');
  });
});
