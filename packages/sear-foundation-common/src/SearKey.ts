/**
 * Global registry for tracking unique key instances.
 * This object maintains a counter for each key name to ensure uniqueness.
 * Structure: { 'keyName': counter, ... }
 *
 * Example: { 'plugin': 0, 'state': 2 }
 * When a new 'plugin' key is requested, it returns 'plugin$1', 'plugin$2', etc.
 */
const keys = Object.create(null);

/**
 * Factory function for creating globally unique keys.
 *
 * The key generation strategy:
 * - First key of a name: returns 'name$'
 * - Subsequent keys: returns 'name$1', 'name$2', 'name$3', etc.
 *
 * This ensures that each key is unique across the entire application,
 * which is essential for:
 * - Plugin identification in the Sear suite
 * - State management key uniqueness
 * - Preventing naming conflicts in multi-plugin environments
 *
 * @param name - The base name for the key (e.g., 'plugin', 'state').
 * @returns A unique key string based on the provided name and its generation count.
 */
function createKey(name: string) {
  if (name in keys) {
    return name + '$' + ++keys[name];
  }
  keys[name] = 0;
  return name + '$';
}

/**
 * SearKey class for generating unique identifiers within the Sear framework.
 *
 * This class is primarily used for plugin identification and namespace management
 * in the Sear document editing system. Each instance receives a uniquely generated
 * key that prevents naming collisions even when multiple plugins with the same
 * base name are loaded.
 *
 * Use cases:
 * - Plugin identification: Each plugin instance gets a unique key for internal references
 * - State management: Creating unique state keys for different plugin instances
 * - Event system: Identifying event listeners and handlers from different sources
 * - Namespace isolation: Preventing key collisions in shared state objects
 *
 * @example
 * ```typescript
 * const key1 = new SearKey('plugin'); // Returns key='plugin$'
 * const key2 = new SearKey('plugin'); // Returns key='plugin$1'
 * const key3 = new SearKey('plugin'); // Returns key='plugin$2'
 * const key4 = new SearKey('state');  // Returns key='state$'
 * ```
 */
export class SearKey {
  /**
   * The unique key string generated for this instance.
   * Format: '{baseName}$' for the first instance, '{baseName}${count}' for subsequent ones.
   */
  public key: string;

  /**
   * Creates a new SearKey instance with a unique identifier.
   *
   * @param key - The base name for this key (default: 'plugin').
   *              Should be descriptive and represent the purpose of this key.
   */
  constructor(key: string = 'plugin') {
    this.key = createKey(key);
  }
}
