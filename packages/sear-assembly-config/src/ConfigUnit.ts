/** Mutable configuration unit registered by a plugin or assembly module. */
export class ConfigUnit<T extends object = Record<string, unknown>> {
  [key: string]: unknown;

  /** Creates a config unit by copying the provided initial values. */
  constructor(initialConfig?: T) {
    if (initialConfig) {
      Object.assign(this, initialConfig);
    }
  }
}
