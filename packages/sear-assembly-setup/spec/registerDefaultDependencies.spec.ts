import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { PluginManager } from '@searsuite/sear-assembly-plugin';
import { Container } from '@searsuite/sear-foundation-di';
import { registerDefaultDependencies } from '../src';

describe('registerDefaultDependencies', () => {
  it('binds the shared config and plugin registries as container singletons', () => {
    const container = new Container();

    registerDefaultDependencies(container);

    expect(container.resolve(ConfigEngine.symbol)).toBeInstanceOf(ConfigEngine);
    expect(container.resolve(PluginManager.symbol)).toBeInstanceOf(PluginManager);
    expect(container.resolve(ConfigEngine.symbol)).toBe(container.resolve(ConfigEngine.symbol));
    expect(container.resolve(PluginManager.symbol)).toBe(container.resolve(PluginManager.symbol));
  });
});
