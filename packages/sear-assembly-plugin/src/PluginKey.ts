const keys = Object.create(null);

/** Creates a unique plugin key by suffixing repeated names with an incrementing counter. */
function createKey(name: string) {
  if (name in keys) return name + '$' + ++keys[name];
  keys[name] = 0;
  return name + '$';
}

/**
 * Stable unique key assigned to one plugin instance.
 *
 * Plugin managers use this key to store state, render nodes, and diagnostics
 * without requiring plugin classes to be singleton values.
 */
export class PluginKey {
  /** Unique plugin key string. */
  public readonly key: string;

  /**
   * Constructs a key using the provided base name.
   * @param key - Human-readable plugin key prefix.
   */
  constructor(key: string = 'plugin') {
    this.key = createKey(key);
    Object.freeze(this);
  }
}
