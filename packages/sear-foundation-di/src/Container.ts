import { SearError } from '@searsuite/sear-foundation-error';
import 'reflect-metadata';

import { INJECTABLE_METADATA_KEY, INJECT_METADATA_KEY } from './Decorators';

/** Enumerates Scope values. */
export enum Scope {
  Singleton,
  Prototype,
}
type Constructor<T> = new (...args: never[]) => T;
type Identifier<T> = string | symbol | Constructor<T>;
type FactoryFunction<T> = () => T;

/**
 * Editor-scoped registry for constructing and resolving dependencies.
 *
 * A composition root binds tokens to classes, factories, or existing
 * instances, then resolves the services required by one editor. Singleton
 * bindings are cached within this container; prototype bindings create a new
 * value on each resolution. `reset` releases owned instances, while borrowed
 * instances remain the responsibility of their parent owner.
 */
export class Container {
  /** Registered dependency tokens owned by this container. */
  public readonly types = new Map();
  #singletons = new Map();
  #bindings = new Map();
  #resolvingStack: (string | symbol)[] = [];

  // store factory dependencies
  #dependencies = new Map<symbol | string, (symbol | string)[]>();
  /** Adds the dependency. */
  addDependency(parent: symbol, dependency: symbol | string): void {
    if (!this.#dependencies.has(parent)) {
      this.#dependencies.set(parent, []);
    }
    this.#dependencies.get(parent)!.push(dependency);
  }

  /** Registers the types. */
  registerTypes(module: symbol, types: { [key: string]: symbol }): void {
    this.types.set(module, types);
  }

  /** Registers the value. */
  register<T>(identifier: Identifier<T>, clazz: Constructor<T>, scope: Scope = Scope.Prototype): void {
    if (!Reflect.getMetadata(INJECTABLE_METADATA_KEY, clazz)) {
      throw new SearError(`Class ${clazz.name} is not injectable`);
    }
    this.#bindings.set(identifier, { clazz, scope });
  }

  /** Registers the factory. */
  registerFactory<T>(identifier: Identifier<T>, factory: FactoryFunction<T>, scope: Scope = Scope.Singleton): void {
    this.#bindings.set(identifier, { factory, scope });
  }

  /** Registers the instance. */
  registerInstance<T>(identifier: Identifier<T>, instance: T): void {
    this.#bindings.set(identifier, { instance, scope: Scope.Singleton });
  }

  /** Binds a parent-owned instance without acquiring its teardown responsibility. */
  registerBorrowedInstance<T>(identifier: Identifier<T>, instance: T): void {
    this.#bindings.set(identifier, { instance, scope: Scope.Singleton, owned: false });
  }

  /** Returns whether a singleton has already been materialized for an identifier. */
  public hasSingleton(identifier: string | symbol): boolean {
    return this.#singletons.has(identifier);
  }

  /** Returns whether this container has an explicit local binding for an identifier. */
  public hasBinding(identifier: string | symbol): boolean {
    return this.#bindings.has(identifier);
  }

  /** Resolves a dependency from this container and its parent scope. */
  resolve<T>(identifier: string | symbol): T {
    if (this.#resolvingStack.includes(identifier)) {
      throw new SearError(
        `Circular dependency detected: ${this.#resolvingStack
          .map((item) => item.toString())
          .join(' -> ')} -> ${identifier.toString()}`,
      );
    }

    this.#resolvingStack.push(identifier);

    try {
      const binding = this.#bindings.get(identifier);
      if (!binding) {
        throw new SearError(`No binding found for identifier ${identifier.toString()}`);
      }

      let instance: T;

      if (binding.scope === Scope.Singleton) {
        if (!this.#singletons.has(identifier)) {
          if ('factory' in binding) {
            instance = binding.factory();
          } else if ('instance' in binding) {
            return binding.instance;
          } else {
            instance = this.#createInstance(binding.clazz);
          }
          this.#singletons.set(identifier, instance);
        } else {
          instance = this.#singletons.get(identifier);
        }
      } else {
        if ('factory' in binding) {
          instance = binding.factory();
        } else {
          instance = this.#createInstance(binding.clazz);
        }
      }

      return instance;
    } finally {
      this.#resolvingStack.pop();
    }
  }

  /** Creates the lazy. */
  createLazy<T>(identifier: string): () => T {
    const container = this;
    return function resolveLazyDependency(): T {
      return container.resolve<T>(identifier);
    };
  }

  #createInstance<T>(clazz: Constructor<T>): T {
    const metadata = Reflect.getMetadata(INJECT_METADATA_KEY, clazz);
    const injectedParams: unknown[] = Array.isArray(metadata) ? metadata : [];
    const dependencies = injectedParams.map((dep) => this.resolve(dep as string | symbol));
    return Reflect.construct(clazz, dependencies) as T;
  }

  /** Releases created resources and removes every registration from this container. */
  public reset(): void {
    const disposed = new Set<unknown>();
    const candidates = [
      ...this.#singletons.values(),
      ...[...this.#bindings.values()].flatMap((binding) =>
        'instance' in binding && binding.owned !== false ? [binding.instance] : [],
      ),
    ];
    for (const instance of candidates) {
      if (disposed.has(instance)) continue;
      disposed.add(instance);
      if (typeof instance === 'object' && instance !== null) {
        const candidate = instance as {
          destroy?: () => void;
          dispose?: () => void;
        };
        if (candidate.dispose) candidate.dispose();
        else candidate.destroy?.();
      }
    }
    this.types.clear();
    this.#singletons.clear();
    this.#bindings.clear();
    this.#resolvingStack = [];
    this.#dependencies.clear();
  }

  /** @deprecated Use reset() when rebuilding an application or test harness. */
  public dispose(): void {
    this.reset();
  }

  /** @deprecated Use reset() when rebuilding an application or test harness. */
  public destroy(): void {
    this.reset();
  }

  /** Returns the dependency graph text. */
  getDependencyGraphText(): void {
    const colors = ['#1E90FF', '#FFA500', '#32CD32', '#FF4500', '#8A2BE2', '#FFD700'];
    const visited = new Set();

    console.groupCollapsed('%c DI Container DependencyGraph', '');

    const registry = this;
    function printDependencyNode(identifier: symbol | string, level: number): void {
      if (visited.has(identifier)) {
        console.log(`${' '.repeat(level)}- ${String(identifier)} (Circular Dependency)`);
        return;
      }
      visited.add(identifier);

      const color = colors[level % colors.length];

      console.log(`${'    '.repeat(level)}${level ? '├──' : ''}%c ${String(identifier)}`, `color: ${color};`);

      const deps = registry.#dependencies.get(identifier) || [];

      if (deps.length > 0) {
        deps.forEach((dep) => {
          printDependencyNode(dep, level + 1);
        });
      }
      visited.delete(identifier);
    }
    for (const [identifier] of this.#dependencies.entries()) {
      printDependencyNode(identifier, 0);
    }
    console.groupEnd();
  }

  /** Returns the dependency. */
  getDependency(): void {
    let output = 'Graph:\n';

    const resolveDependencies = (
      identifier: Identifier<unknown>,
      indentLevel: number = 0,
      visited: Set<Identifier<unknown>> = new Set(),
    ): void => {
      if (visited.has(identifier)) {
        output += `${'  '.repeat(indentLevel)}- ${identifier.toString()} (Circular)\n`;
        return;
      }
      visited.add(identifier);

      const binding = this.#bindings.get(identifier);

      if (!binding) {
        output += `${'  '.repeat(indentLevel)}- ${identifier.toString()} (No binding found)\n`;
        return;
      }

      const clazz = binding.clazz;
      const identifierName = typeof identifier === 'function' ? identifier.name : identifier.toString();
      const isSingleton = binding.scope === Scope.Singleton ? ' (Singleton)' : '';

      output += `${'  '.repeat(indentLevel)}- ${identifierName}${isSingleton}\n`;

      if (clazz) {
        const injectedParams = Reflect.getMetadata(INJECT_METADATA_KEY, clazz) || [];
        injectedParams.forEach((dep: unknown) => {
          resolveDependencies(dep as Identifier<unknown>, indentLevel + 1, new Set(visited));
        });
      }

      visited.delete(identifier);
    };

    for (const [identifier] of this.#bindings.entries()) {
      resolveDependencies(identifier);
    }

    // output += '\n\nSingletons:\n';
    // for (const [identifier] of this.singletons.entries()) {
    //     const identifierName = typeof identifier === 'function' ? identifier.name : identifier.toString();
    //     output += `- ${identifierName}\n`;
    // }

    console.groupCollapsed('%c DI Container DependencyGraph', 'font-weight: bold;');
    console.log(output);
    console.groupEnd();
  }
}
