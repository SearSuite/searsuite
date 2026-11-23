import { HeadlessScroller, ScrollerFactory } from '../src';

describe('ScrollerFactory', () => {
  it('creates registered scrollers and surfaces unknown registrations', () => {
    const key = Symbol('headless-scroller');
    const args = { target: 'test' };
    const creator = jest.fn(() => new HeadlessScroller());
    ScrollerFactory.registerScroller(key, creator);

    const scroller = ScrollerFactory.createScroller(key, args);
    expect(scroller).toBeInstanceOf(HeadlessScroller);
    expect(creator).toHaveBeenCalledWith(args);
    expect(() => ScrollerFactory.createScroller('missing', null)).toThrow('No scroller registered');
  });
});
