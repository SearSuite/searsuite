import { PluginKey } from '@searsuite/sear-assembly-plugin';

import { ConfigEngine, ConfigUnit, defaultDocConfig, defaultSheetConfig } from '../src';

describe('ConfigEngine', () => {
  it('registers and retrieves isolated plugin configurations', () => {
    const engine = new ConfigEngine();
    const key = new PluginKey('first');

    engine.registerConfig(key, { enabled: true, nested: { width: 100 } });

    expect(engine.getConfig<{ enabled: boolean; nested: { width: number } }>(key)).toMatchObject({
      enabled: true,
      nested: { width: 100 },
    });
    expect(engine.getConfig(new PluginKey('missing'))).toBe(void 0);
    expect(() => engine.registerConfig(key, { enabled: false })).toThrow('already exists');
  });

  it('accepts plain string config keys at the runtime boundary', () => {
    const engine = new ConfigEngine();

    engine.registerConfig('plain-key', { enabled: true });

    expect(engine.getConfig<{ enabled: boolean }>('plain-key')).toMatchObject({ enabled: true });
    expect(() => engine.registerConfig('plain-key', { enabled: false })).toThrow(
      'Configuration for plugin "plain-key" already exists.',
    );
  });

  it('merges registered plugin configuration values', () => {
    const engine = new ConfigEngine();
    engine.registerConfig(new PluginKey('first'), { shared: 'first', a: 1 });
    engine.registerConfig(new PluginKey('second'), { shared: 'second', b: 2 });

    expect(engine.getCombinedConfig<{ shared: string; a: number; b: number }>()).toMatchObject({
      shared: 'second',
      a: 1,
      b: 2,
    });
  });

  it('rejects a missing plugin key at the runtime boundary', () => {
    const engine = new ConfigEngine();

    expect(() => engine.registerConfig(null as unknown as PluginKey, { enabled: true })).toThrow(
      'Plugin name cannot be empty.',
    );
  });

  it('exposes standalone Doc defaults through a ConfigUnit-compatible object', () => {
    const defaults = new ConfigEngine(defaultDocConfig).getDefaultConfig();
    const unit = new ConfigUnit(defaults);

    expect(unit).toMatchObject({
      docFontSize: 16,
      docFontFamily: expect.stringContaining('Inter'),
      docVerticalAlign: 'top',
      incrementalRenderPolicyLimits: {
        maxCopiedAreaRatio: 1.5,
        maxInvalidAreaRatio: 1,
        maxCopyCount: 64,
        maxInvalidRectCount: 16,
      },
    });
    expect(unit).not.toHaveProperty('sheetCellFontSize');
    expect(unit).not.toHaveProperty('sheetCellFontFamily');
  });

  it('exposes ordinary Sheet defaults as a separate configuration object', () => {
    const defaults = new ConfigEngine(defaultSheetConfig).getDefaultConfig();

    expect(defaults).toMatchObject({
      devicePixelRatio: 4,
      cellPadding: 4,
      sheetOffsetX: 50,
      sheetOffsetY: 24,
      sheetCellFontSize: 10,
      sheetCellFontFamily: expect.stringContaining('Inter'),
    });
    expect(defaults).not.toHaveProperty('docFontSize');
    expect(defaults).not.toHaveProperty('docFontFamily');
    expect(defaults).not.toHaveProperty('incrementalRenderPolicyLimits');
  });

  it('applies host overrides to the selected configuration only', () => {
    const defaults = new ConfigEngine(defaultDocConfig, {
      docFontSize: 13,
      docFontFamily: 'Test Sans',
      docVerticalAlign: 'center',
      incrementalRenderPolicyLimits: {
        maxCopiedAreaRatio: 1,
        maxInvalidAreaRatio: 0.5,
        maxCopyCount: 2,
        maxInvalidRectCount: 1,
      },
    }).getDefaultConfig();

    expect(defaults.docFontSize).toBe(13);
    expect(defaults.docFontFamily).toBe('Test Sans');
    expect(defaults.docVerticalAlign).toBe('center');
    expect(defaults.incrementalRenderPolicyLimits.maxInvalidAreaRatio).toBe(0.5);
    expect(defaults).not.toHaveProperty('cellPadding');
  });

  it('updates the selected default configuration overrides at runtime', () => {
    const engine = new ConfigEngine(defaultDocConfig, { docFontSize: 13, docFontFamily: 'Test Sans' });

    engine.updateDefaultConfigOverrides({
      incrementalRenderPolicyLimits: {
        maxCopiedAreaRatio: 2,
        maxInvalidAreaRatio: 0.75,
        maxCopyCount: 8,
        maxInvalidRectCount: 4,
      },
    });

    const defaults = engine.getDefaultConfig();
    expect(defaults.docFontSize).toBe(13);
    expect(defaults.docFontFamily).toBe('Test Sans');
    expect(defaults.incrementalRenderPolicyLimits).toEqual({
      maxCopiedAreaRatio: 2,
      maxInvalidAreaRatio: 0.75,
      maxCopyCount: 8,
      maxInvalidRectCount: 4,
    });
  });

  it('reacts to top-level plugin configuration mutations', () => {
    const engine = new ConfigEngine();
    const key = new PluginKey('reactive');
    engine.registerConfig(key, { enabled: true });
    const config = engine.getConfig<{ enabled: boolean }>(key);
    if (!config) throw new Error('plugin config missing');

    config.enabled = false;

    expect(config.enabled).toBe(false);
  });

  it('locks retained configuration handles after assembly without copying each read', () => {
    const defaults = { nested: { width: 100 } };
    const engine = new ConfigEngine(defaults);
    const pluginConfig = { nested: { enabled: true } };
    engine.registerConfig('plugin', pluginConfig);
    const retained = engine.getConfig<typeof pluginConfig>('plugin')!;
    let executing = false;
    engine.enforceCommandBoundary(() => executing);

    expect(() => {
      (engine as unknown as { defaultConfigOverrides: object }).defaultConfigOverrides = { nested: { width: 900 } };
    }).toThrow();
    expect(engine.getDefaultConfig().nested.width).toBe(100);

    expect(() => {
      defaults.nested.width = 200;
    }).toThrow();
    expect(() => {
      pluginConfig.nested.enabled = false;
    }).toThrow();
    expect(() => {
      retained.nested.enabled = false;
    }).toThrow();
    expect(() => engine.updateDefaultConfigOverrides({ nested: { width: 200 } })).toThrow('editor.commands.run');
    executing = true;
    engine.updateDefaultConfigOverrides({ nested: { width: 200 } });
    executing = false;
    expect(engine.getDefaultConfig().nested.width).toBe(200);
    expect(() => {
      engine.getDefaultConfig().nested.width = 300;
    }).toThrow();
  });

  it('rejects writes when a retained engine has a forged command guard', () => {
    const engine = new ConfigEngine({ width: 100 });
    Object.assign(engine, { assertCommandWrite: () => void 0 });
    engine.enforceCommandBoundary(() => false);

    expect(() => engine.updateDefaultConfigOverrides({ width: 200 })).toThrow('editor.commands.run');
    expect(engine.getDefaultConfig().width).toBe(100);
  });
});
