import * as publicApi from '../src/index';

describe('@searsuite/sear-assembly-config public API', () => {
  it('exports ConfigEngine, ConfigUnit, and scoped default configurations', () => {
    expect(publicApi.ConfigEngine).toBeDefined();
    expect(publicApi.ConfigUnit).toBeDefined();
    expect(publicApi.defaultDocConfig).toBeDefined();
    expect(publicApi.defaultSheetConfig).toBeDefined();
    expect(publicApi.defaultDocConfig).not.toBe(publicApi.defaultSheetConfig);
  });
});
