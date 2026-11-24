import { SearKey } from '../src/SearKey';

describe('SearKey', () => {
  describe('Basic key generation', () => {
    it('should create a key with default name', () => {
      const key = new SearKey();
      expect(key.key).toContain('plugin');
    });

    it('should generate first key with $ suffix', () => {
      const key = new SearKey('unique-test-1');
      expect(key.key).toBe('unique-test-1$');
    });

    it('should generate second key with $1 suffix', () => {
      const name = 'unique-test-2';
      const key1 = new SearKey(name);
      const key2 = new SearKey(name);
      expect(key1.key).toBe('unique-test-2$');
      expect(key2.key).toBe('unique-test-2$1');
    });

    it('should generate third key with $2 suffix', () => {
      const name = 'unique-test-3';
      const key1 = new SearKey(name);
      const key2 = new SearKey(name);
      const key3 = new SearKey(name);
      expect(key1.key).toBe('unique-test-3$');
      expect(key2.key).toBe('unique-test-3$1');
      expect(key3.key).toBe('unique-test-3$2');
    });

    it('should handle multiple base names independently', () => {
      const nameA = 'test-a-independent';
      const nameB = 'test-b-independent';
      const keyA1 = new SearKey(nameA);
      const keyB1 = new SearKey(nameB);
      const keyA2 = new SearKey(nameA);
      const keyB2 = new SearKey(nameB);
      expect(keyA1.key).toBe('test-a-independent$');
      expect(keyB1.key).toBe('test-b-independent$');
      expect(keyA2.key).toBe('test-a-independent$1');
      expect(keyB2.key).toBe('test-b-independent$1');
    });

    it('should maintain separate counters for different names', () => {
      const key1 = new SearKey('counter-test-1');
      const key2 = new SearKey('counter-test-1');
      const key3 = new SearKey('counter-test-2');
      const key4 = new SearKey('counter-test-2');
      const key5 = new SearKey('counter-test-1');
      expect(key1.key).toBe('counter-test-1$');
      expect(key2.key).toBe('counter-test-1$1');
      expect(key3.key).toBe('counter-test-2$');
      expect(key4.key).toBe('counter-test-2$1');
      expect(key5.key).toBe('counter-test-1$2');
    });
  });

  describe('Default parameter behavior', () => {
    it('should use plugin as default', () => {
      const key = new SearKey();
      expect(key.key).toMatch(/^plugin\$\d*$/);
    });

    it('should accept custom names', () => {
      const key = new SearKey('my-custom-plugin');
      expect(key.key).toContain('my-custom-plugin');
    });
  });

  describe('Key format and structure', () => {
    it('should follow correct format', () => {
      const key1 = new SearKey('format-test');
      const key2 = new SearKey('format-test');
      expect(key1.key).toMatch(/^format-test\$$/);
      expect(key2.key).toMatch(/^format-test\$\d+$/);
    });

    it('should preserve base name in key', () => {
      const baseName = 'my-plugin-name-123';
      const key = new SearKey(baseName);
      expect(key.key).toContain(baseName);
    });

    it('should use $ as delimiter', () => {
      const key1 = new SearKey('delimiter-test');
      const key2 = new SearKey('delimiter-test');
      expect(key1.key).toContain('$');
      expect(key2.key).toContain('$');
    });

    it('should handle names with special characters', () => {
      const key = new SearKey('plugin-v1.0.0');
      expect(key.key).toBe('plugin-v1.0.0$');
    });

    it('should handle names with numbers', () => {
      const key1 = new SearKey('plugin123');
      const key2 = new SearKey('plugin123');
      expect(key1.key).toBe('plugin123$');
      expect(key2.key).toBe('plugin123$1');
    });

    it('should handle single character names', () => {
      const key1 = new SearKey('a');
      const key2 = new SearKey('a');
      expect(key1.key).toBe('a$');
      expect(key2.key).toBe('a$1');
    });

    it('should handle empty string name', () => {
      const key1 = new SearKey('');
      const key2 = new SearKey('');
      expect(key1.key).toBe('$');
      expect(key2.key).toBe('$1');
    });
  });

  describe('Key uniqueness', () => {
    it('should generate unique keys for each instance', () => {
      const names: string[] = [];
      for (let i = 0; i < 5; i++) {
        const key = new SearKey('uniqueness-test');
        names.push(key.key);
      }
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(5);
    });

    it('should assign incrementing numbers for same base name', () => {
      const baseName = 'increment-test';
      const keys = [];
      for (let i = 0; i < 5; i++) {
        keys.push(new SearKey(baseName).key);
      }
      expect(keys[0]).toBe('increment-test$');
      expect(keys[1]).toBe('increment-test$1');
      expect(keys[2]).toBe('increment-test$2');
      expect(keys[3]).toBe('increment-test$3');
      expect(keys[4]).toBe('increment-test$4');
    });
  });

  describe('Public key property', () => {
    it('should expose key as public property', () => {
      const key = new SearKey('property-test');
      expect(key.key).toBeDefined();
      expect(typeof key.key).toBe('string');
    });

    it('should have readable key property', () => {
      const key = new SearKey('readable-test');
      const keyValue = key.key;
      expect(keyValue).toContain('readable-test');
    });

    it('should allow accessing key property multiple times', () => {
      const key = new SearKey('access-test');
      const firstAccess = key.key;
      const secondAccess = key.key;
      expect(firstAccess).toBe(secondAccess);
    });
  });

  describe('Real-world plugin scenarios', () => {
    it('should support plugin ecosystem with multiple plugins', () => {
      const plugins = [
        { name: 'editor', version: '1.0.0' },
        { name: 'table', version: '2.0.0' },
        { name: 'chart', version: '1.5.0' },
      ];

      const pluginKeys = plugins.map((plugin) => {
        const key = new SearKey(plugin.name);
        return { ...plugin, key: key.key };
      });

      const keySet = new Set(pluginKeys.map((p) => p.key));
      expect(keySet.size).toBe(plugins.length);
    });

    it('should handle multiple instances of same plugin type', () => {
      const cellEditorInstances = [new SearKey('cell-editor'), new SearKey('cell-editor'), new SearKey('cell-editor')];

      const keys = cellEditorInstances.map((instance) => instance.key);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(3);
      expect(keys[0]).toBe('cell-editor$');
      expect(keys[1]).toBe('cell-editor$1');
      expect(keys[2]).toBe('cell-editor$2');
    });

    it('should support dynamic plugin loading simulation', () => {
      const key1 = new SearKey('dynamic-plugin');
      const key2 = new SearKey('dynamic-plugin');
      expect(key2.key).toBe('dynamic-plugin$1');

      const key3 = new SearKey('dynamic-plugin');
      expect(key3.key).toBe('dynamic-plugin$2');
    });

    it('should use keys for state namespace isolation', () => {
      const plugin1Key = new SearKey('state-plugin');
      const plugin2Key = new SearKey('state-plugin');

      const stateMap = new Map();
      stateMap.set(plugin1Key.key, { data: 'plugin1-state' });
      stateMap.set(plugin2Key.key, { data: 'plugin2-state' });

      expect(stateMap.get(plugin1Key.key)).toEqual({ data: 'plugin1-state' });
      expect(stateMap.get(plugin2Key.key)).toEqual({ data: 'plugin2-state' });
    });

    it('should support event listener identification', () => {
      const plugin1 = new SearKey('event-plugin');
      const plugin2 = new SearKey('event-plugin');

      const listeners = new Map();
      listeners.set(plugin1.key, ['onClick', 'onHover']);
      listeners.set(plugin2.key, ['onDoubleClick', 'onContextMenu']);

      expect(listeners.get(plugin1.key)).toEqual(['onClick', 'onHover']);
      expect(listeners.get(plugin2.key)).toEqual(['onDoubleClick', 'onContextMenu']);
      expect(listeners.size).toBe(2);
    });

    it('should generate stable keys for same instance', () => {
      const plugin = new SearKey('stable-plugin');
      const firstReference = plugin.key;
      const secondReference = plugin.key;
      const thirdReference = plugin.key;

      expect(firstReference).toBe(secondReference);
      expect(secondReference).toBe(thirdReference);
    });

    it('should support registry pattern', () => {
      class PluginRegistry {
        #plugins: Map<string, unknown> = new Map();

        registerPlugin(name: string, config: unknown) {
          const key = new SearKey(name);
          this.#plugins.set(key.key, config);
          return key.key;
        }

        getPluginCount() {
          return this.#plugins.size;
        }
      }

      const registry = new PluginRegistry();
      const key1 = registry.registerPlugin('my-plugin', { version: '1.0' });
      const key2 = registry.registerPlugin('my-plugin', { version: '1.1' });

      expect(registry.getPluginCount()).toBe(2);
      expect(key1).not.toBe(key2);
    });
  });

  describe('Global state management', () => {
    it('should maintain global counter across instances', () => {
      const globalTest = 'global-counter-test';
      const instances: SearKey[] = [];

      for (let i = 0; i < 3; i++) {
        instances.push(new SearKey(globalTest));
      }

      for (let i = 0; i < instances.length; i++) {
        if (i === 0) {
          expect(instances[i].key).toBe(`${globalTest}$`);
        } else {
          expect(instances[i].key).toBe(`${globalTest}$${i}`);
        }
      }
    });

    it('should persist counter across different instances', () => {
      const baseName = 'persistence-test';
      const key1 = new SearKey(baseName);
      const key2 = new SearKey(baseName);
      const key3 = new SearKey(baseName);

      expect(key1.key).not.toBe(key2.key);
      expect(key2.key).not.toBe(key3.key);

      const num1 = parseInt(key1.key.split('$')[1] || '-1');
      const num2 = parseInt(key2.key.split('$')[1] || '-1');
      const num3 = parseInt(key3.key.split('$')[1] || '-1');

      expect(num2).toBeGreaterThan(num1);
      expect(num3).toBeGreaterThan(num2);
    });
  });
});
