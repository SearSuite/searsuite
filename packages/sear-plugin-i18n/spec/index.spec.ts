import * as publicApi from '../src';

describe('@searsuite/sear-plugin-i18n public API', () => {
  it('exports i18n plugin contracts and runtime entry points', () => {
    expect(publicApi.SheetI18nPlugin).toBeDefined();
    expect(publicApi.SheetI18nBuiltInLocale).toEqual({ English: 'en', Chinese: 'zh' });
    expect(publicApi.SheetI18nLocaleRegistry).toBeDefined();
    expect(publicApi.SheetI18nLocaleRegistryCapability).toBeDefined();
    expect(publicApi.SetSheetLocaleCommand).toBeDefined();
    expect(publicApi.ToggleSheetLocaleCommand).toBeDefined();
    expect(publicApi.SheetI18nStateObservation).toBeDefined();
    expect(publicApi.SheetI18nSessionStateDefinition).toBeDefined();
    expect(publicApi.isSheetI18nLocale('en')).toBe(true);
  });
});
