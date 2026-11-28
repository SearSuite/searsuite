import { cloneSessionStateValue, runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';

/** Keeps a live reader while detaching every value delivered to its caller. */
export function createQueryReader<Result>(reader: Result): Result {
  if (reader === null || typeof reader !== 'object') {
    throw new SearError('Reader queries must return a reader object.');
  }

  const facade: Record<PropertyKey, unknown> = Object.create(null);
  const included = new Set<PropertyKey>();
  let owner: object | null = reader;
  while (owner && owner !== Object.prototype) {
    for (const key of Reflect.ownKeys(owner)) {
      if (key === 'constructor' || included.has(key)) continue;
      included.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      Object.defineProperty(facade, key, {
        configurable: false,
        enumerable: descriptor?.enumerable ?? false,
        get(): unknown {
          const value = runOutsideCommandExecution(() => Reflect.get(reader, key, reader));
          if (typeof value !== 'function') return cloneSessionStateValue(value);
          return (...args: unknown[]) => {
            const safeArgs = args.map((arg) =>
              typeof arg === 'function'
                ? (...values: unknown[]) => arg(...values.map((item) => cloneSessionStateValue(item)))
                : arg,
            );
            return runOutsideCommandExecution(() => cloneSessionStateValue(value.apply(reader, safeArgs)));
          };
        },
      });
    }
    owner = Object.getPrototypeOf(owner);
  }
  return Object.freeze(facade) as Result;
}
