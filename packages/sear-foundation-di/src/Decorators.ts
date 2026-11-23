import 'reflect-metadata';

/** Private metadata key that marks a class as singleton-scoped. */
const SINGLETON_METADATA_KEY = Symbol('singleton');

/** Metadata key that marks a class as resolvable by the DI container. */
export const INJECTABLE_METADATA_KEY = Symbol('injectable');

/** Metadata key storing constructor parameter injection tokens. */
export const INJECT_METADATA_KEY = Symbol('inject');

/**
 * Marks a class as injectable by the DI container.
 * @returns Class decorator that records injectable metadata.
 */
export function Injectable(): ClassDecorator {
  return function markInjectable(target: Function): void {
    Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
  };
}

/**
 * Marks a class as injectable and singleton-scoped.
 * @returns Class decorator that records singleton and injectable metadata.
 */
export function Singleton(): ClassDecorator {
  return function markSingleton(target: Function): void {
    Reflect.defineMetadata(SINGLETON_METADATA_KEY, true, target);
    Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
  };
}

/**
 * Records the DI token that should satisfy one constructor parameter.
 * @param identifier - Token registered in the DI container.
 * @returns Parameter decorator used on constructor arguments.
 */
export function Inject(identifier: unknown): ParameterDecorator {
  return function recordInjectedParameter(
    target: Object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void {
    const metadata = Reflect.getOwnMetadata(INJECT_METADATA_KEY, target);
    const existingInjectedParams: unknown[] = Array.isArray(metadata) ? metadata : [];
    existingInjectedParams[parameterIndex] = identifier;
    Reflect.defineMetadata(INJECT_METADATA_KEY, existingInjectedParams, target);
  };
}
