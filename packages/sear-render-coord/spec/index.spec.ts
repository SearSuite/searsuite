import * as moduleExports from '../src/index';

describe('@searsuite/sear-render-coord public API', () => {
  it('exports CoordinateEngine and factory utilities', () => {
    expect(moduleExports.CoordinateEngine).toBeDefined();
    expect(moduleExports.createDefaultCoordinateState).toBeDefined();
  });
});
