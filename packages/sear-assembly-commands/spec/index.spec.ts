import * as publicApi from '../src/index';

describe('index exports', () => {
  it('should export modules', () => {
    expect(publicApi).toBeDefined();

    const keys = Object.keys(publicApi);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect((publicApi as Record<string, unknown>)[key]).not.toBeUndefined();
    }
  });
});
