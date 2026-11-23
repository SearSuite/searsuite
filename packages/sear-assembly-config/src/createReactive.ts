import { SearError } from '@searsuite/sear-foundation-error';

/**
 * Wraps a plain object in a recursive reactive proxy.
 *
 * Nested objects are proxied lazily on read, and any changed assignment calls
 * onChange once. Arrays are intentionally rejected because this configuration
 * layer does not define array mutation semantics.
 *
 * @template T - Configuration object shape.
 * @param obj - Plain configuration object to wrap.
 * @param onChange - Callback invoked after a property value changes.
 * @returns A proxy preserving the input object's public shape.
 */
export function createReactiveConfig<T extends object>(obj: T, onChange: () => void): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (Array.isArray(value)) throw new SearError('Array is not supported');

      if (value && typeof value === 'object') {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
        if (descriptor && !descriptor.configurable && !descriptor.writable) return value;
        return createReactiveConfig(value, onChange);
      }
      return value;
    },
    set(target, prop, value, receiver) {
      const oldValue = Reflect.get(target, prop, receiver);
      const result = Reflect.set(target, prop, value, receiver);
      if (oldValue !== value) {
        onChange();
      }
      return result;
    },
  });
}
