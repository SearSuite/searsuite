import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { ConfigUnit } from './ConfigUnit';
import { createReactiveConfig } from './createReactive';

/** Stable configuration owner key accepted from plugins or assembly modules. */
export type ConfigKey = string | { readonly key: string };

/** Host-provided overrides for one editor-owned configuration object. */
export type EditorDefaultConfigOverrides<TConfig extends object = any> = Partial<TConfig> & Record<string, unknown>;

/** Registry and merger for one editor-owned configuration scope. */
@Injectable()
export class ConfigEngine<TConfig extends object = any> {
  /** DI token for resolving the shared configuration engine. */
  public static readonly symbol: symbol = Symbol.for('ConfigEngine');

  // Map<PluginKey, unknown> = new Map();
  readonly #config = new Map<ConfigKey, ConfigUnit<Record<string, unknown>>>();
  #defaultConfigOverrides: EditorDefaultConfigOverrides<TConfig>;
  readonly #defaults: TConfig;
  #isCommandExecuting: (() => boolean) | undefined;

  /** Creates the engine for one composition-root-owned default configuration object. */
  constructor(defaults: TConfig = {} as TConfig, initialConfig?: EditorDefaultConfigOverrides<TConfig>) {
    this.#defaults = defaults;
    this.#defaultConfigOverrides = initialConfig ?? {};
  }

  /** Seals retained configuration handles after editor initialization. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Configuration command boundary is already installed.');
    lockConfigValue(this.#defaults, new WeakSet<object>());
    lockConfigValue(this.#defaultConfigOverrides, new WeakSet<object>());
    for (const config of this.#config.values()) lockConfigValue(config, new WeakSet<object>());
    this.#isCommandExecuting = isCommandExecuting;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Configuration changes must run through editor.commands.run(...).');
    }
  }

  /** Returns this editor's defaults merged with its host/runtime overrides. */
  public getDefaultConfig(): TConfig {
    return {
      ...this.#defaults,
      ...this.#defaultConfigOverrides,
    } as TConfig;
  }

  /** Merges host/runtime default overrides into future default-config reads. */
  public updateDefaultConfigOverrides(overrides: EditorDefaultConfigOverrides<TConfig>): void {
    this.#assertCommandWrite();
    const next = {
      ...this.#defaultConfigOverrides,
      ...overrides,
    };
    if (this.#isCommandExecuting) lockConfigValue(next, new WeakSet<object>());
    this.#defaultConfigOverrides = next;
  }

  /**
   * Register plugin config
   * @param pluginKey Stable key that owns the configuration.
   * @param pluginConfig Plugin config
   */
  public registerConfig<T extends object>(pluginKey: ConfigKey, pluginConfig: T): void {
    this.#assertCommandWrite();
    if (!pluginKey) {
      throw new SearError('Plugin name cannot be empty.');
    }

    if (this.#config.has(pluginKey)) {
      throw new SearError(`Configuration for plugin "${formatConfigKey(pluginKey)}" already exists.`);
    }

    const configInstance = new ConfigUnit<T>(pluginConfig); // Wrap plugin config into ConfigUnit
    const registered = createReactiveConfig(configInstance, () => {});
    if (this.#isCommandExecuting) lockConfigValue(registered, new WeakSet<object>());
    this.#config.set(pluginKey, registered);
  }

  /**
   * Get merged config of all plugins
   * @returns Merged config
   */
  public getCombinedConfig<T extends object = Record<string, unknown>>(): ConfigUnit<T> & T {
    const combinedConfig = Array.from(this.#config.values()).reduce((acc, config) => {
      return { ...acc, ...config };
    }, new ConfigUnit<T>());

    return combinedConfig as ConfigUnit<T> & T;
  }

  /**
   * Get config of specified plugin
   * @param pluginKey Stable key whose configuration should be returned.
   * @returns Plugin configuration
   */
  public getConfig<T extends object>(pluginKey: ConfigKey): (ConfigUnit<T> & T) | undefined {
    return this.#config.get(pluginKey) as (ConfigUnit<T> & T) | undefined;
  }
}

function lockConfigValue(value: unknown, seen: WeakSet<object>): void {
  if (typeof value === 'function') throw new SearError('Editor configuration cannot contain functions.');
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && !(value instanceof ConfigUnit) && prototype !== Object.prototype && prototype !== null) {
    throw new SearError('Editor configuration must contain plain data.');
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw new SearError('Editor configuration cannot contain accessors.');
    lockConfigValue(descriptor.value, seen);
  }
  Object.freeze(value);
}

function formatConfigKey(pluginKey: ConfigKey): string {
  return typeof pluginKey === 'string' ? pluginKey : pluginKey.key;
}

export { ConfigUnit } from './ConfigUnit';
