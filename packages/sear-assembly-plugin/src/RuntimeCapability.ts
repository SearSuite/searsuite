import { RuntimeCapabilityError, RuntimeCapabilityErrorCode } from './RuntimeCapabilityError';

/** Typed token used to publish an editor-owned runtime service to plugins and hosts. */
export interface RuntimeCapability<T> {
  readonly id: string;
  readonly symbol: symbol;
  /** Phantom member preserving the capability value type. */
  readonly type?: T;
}

/** Creates an immutable runtime capability definition with a stable process-wide identity. */
export function defineRuntimeCapability<T>(id: string): RuntimeCapability<T> {
  if (id.trim().length === 0) {
    throw new RuntimeCapabilityError(
      RuntimeCapabilityErrorCode.InvalidDefinition,
      'Runtime capability definitions require a non-empty id.',
      { capabilityId: id },
    );
  }
  return Object.freeze({ id, symbol: Symbol.for(id) }) as RuntimeCapability<T>;
}

/** Read-only capability view exposed by an editor facade. */
export interface RuntimeCapabilityReader {
  get<T>(capability: RuntimeCapability<T>): T | undefined;
  require<T>(capability: RuntimeCapability<T>): T;
  has(capability: RuntimeCapability<unknown>): boolean;
  getRegisteredCapabilityIds(): readonly string[];
}

/** Exposes selected capabilities without handing hosts the mutable registry itself. */
export function createRuntimeCapabilityReader(
  registry: RuntimeCapabilityRegistry,
  hidden: readonly RuntimeCapability<unknown>[] = [],
): RuntimeCapabilityReader {
  const hiddenSymbols = new Set(hidden.map((capability) => capability.symbol));
  const hiddenIds = new Set(hidden.map((capability) => capability.id));
  const reader: RuntimeCapabilityReader = {
    get<T>(capability: RuntimeCapability<T>): T | undefined {
      return hiddenSymbols.has(capability.symbol) ? undefined : registry.get(capability);
    },
    require<T>(capability: RuntimeCapability<T>): T {
      if (!hiddenSymbols.has(capability.symbol)) return registry.require(capability);
      throw new RuntimeCapabilityError(
        RuntimeCapabilityErrorCode.NotRegistered,
        `Runtime capability "${capability.id}" is not exposed to the host.`,
        { capabilityId: capability.id },
      );
    },
    has(capability: RuntimeCapability<unknown>): boolean {
      return !hiddenSymbols.has(capability.symbol) && registry.has(capability);
    },
    getRegisteredCapabilityIds(): readonly string[] {
      return registry.getRegisteredCapabilityIds().filter((id) => !hiddenIds.has(id));
    },
  };
  return Object.freeze(reader);
}

/** Editor-local registry shared by Sheet, Doc and Workbook assemblies. */
export class RuntimeCapabilityRegistry implements RuntimeCapabilityReader {
  readonly #entries = new Map<symbol, { capability: RuntimeCapability<unknown>; value: unknown }>();
  #destroyed = false;
  #assertWrite: (() => void) | null = null;

  public constructor(private readonly owner: string = 'editor runtime') {}

  /** Requires editor command dispatch for capability changes after assembly. */
  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) {
      throw new RuntimeCapabilityError(RuntimeCapabilityErrorCode.RegistrationConflict,
        `Runtime capability write boundary is already installed for ${this.owner}.`, { owner: this.owner });
    }
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  /** Registers one value and returns an idempotent disposer for that registration. */
  public register<T>(capability: RuntimeCapability<T>, value: T): () => void {
    this.assertLive();
    this.#assertWrite?.();
    const existing = this.#entries.get(capability.symbol);
    if (existing) {
      throw new RuntimeCapabilityError(
        RuntimeCapabilityErrorCode.RegistrationConflict,
        `Runtime capability "${capability.id}" is already registered for ${this.owner}.`,
        { owner: this.owner, capabilityId: capability.id, registeredCapabilityId: existing.capability.id },
      );
    }
    this.#entries.set(capability.symbol, { capability, value });
    let disposed = false;
    const registry = this;
    return function unregisterRuntimeCapability(): void {
      registry.#assertWrite?.();
      if (disposed) return;
      disposed = true;
      registry.#entries.delete(capability.symbol);
    };
  }

  public get<T>(capability: RuntimeCapability<T>): T | undefined {
    this.assertLive();
    return this.#entries.get(capability.symbol)?.value as T | undefined;
  }

  public require<T>(capability: RuntimeCapability<T>): T {
    const value = this.get(capability);
    if (value === void 0) {
      throw new RuntimeCapabilityError(
        RuntimeCapabilityErrorCode.NotRegistered,
        `Runtime capability "${capability.id}" is not registered for ${this.owner}.`,
        { owner: this.owner, capabilityId: capability.id },
      );
    }
    return value;
  }

  public has(capability: RuntimeCapability<unknown>): boolean {
    this.assertLive();
    return this.#entries.has(capability.symbol);
  }

  public getRegisteredCapabilityIds(): readonly string[] {
    this.assertLive();
    return [...this.#entries.values()].map(({ capability }) => capability.id).sort();
  }

  /** Permanently closes the registry and releases all published values. */
  public destroy(): void {
    if (this.#destroyed) return;
    this.#assertWrite?.();
    this.#destroyed = true;
    this.#entries.clear();
  }

  private assertLive(): void {
    if (!this.#destroyed) return;
    throw new RuntimeCapabilityError(
      RuntimeCapabilityErrorCode.RegistryDestroyed,
      `Runtime capability registry for ${this.owner} has been destroyed.`,
      { owner: this.owner },
    );
  }
}
