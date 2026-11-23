import * as publicApi from '../src/index';

describe('index exports', () => {
  it('exposes all barrel members as defined values', () => {
    expect(publicApi).toBeDefined();

    const keys = Object.keys(publicApi);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect((publicApi as Record<string, unknown>)[key]).not.toBeUndefined();
    }
  });
});
