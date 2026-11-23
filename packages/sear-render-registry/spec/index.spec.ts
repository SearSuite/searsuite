import * as indexExports from '../src/index';

describe('index', () => {
  it('exports everything', () => {
    expect(indexExports).toBeDefined();
    for (const key of Object.keys(indexExports)) {
      expect((indexExports as any)[key]).toBeDefined();
    }
  });
});
