import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';

import { DataViewFieldDuplicateError } from './DataViewFieldDuplicateError';

/** Selector used to publish one registered state field into a named data view. */
export type DataEngineViewFieldSelector<StateType = unknown> = {
  /** Reads a field from the current plugin-owned state. */
  select(state: StateType): unknown;
}['select'];

/** Field metadata associated with one DataEngine state registration. */
export interface DataEngineViewFieldRegistration<StateType = unknown> {
  /** Named read model that receives the selected field. */
  readonly viewKey: string;
  /** Field name written into the named view. */
  readonly fieldKey: string;
  /** Reads the field value from the current owner state. */
  readonly select: DataEngineViewFieldSelector<StateType>;
  /** When false, missing owner state or void field values do not make the containing view unavailable. */
  readonly required?: boolean;
}

/** Metadata associated with one DataEngine state registration. */
export interface DataEngineRegistrationOptions<StateType = unknown> {
  /** Field selectors contributed by the registered state to named data views. */
  readonly dataView?: ReadonlyArray<DataEngineViewFieldRegistration<StateType>>;
}

/** Internal data view field entry bound to the PluginKey that owns its source state. */
interface RegisteredDataEngineViewField {
  /** Plugin key whose registered state is passed to the selector. */
  readonly ownerKey: PluginKey;
  /** Field name written into the named view. */
  readonly fieldKey: string;
  /** Reads the field value from the current owner state. */
  readonly select: (state: unknown) => unknown;
  /** Whether a missing state or void field makes the containing view unavailable. */
  readonly required: boolean;
}

/**
 * Base registry for plugin-owned data engines.
 *
 * Concrete engines can register custom data types by plugin key while exposing
 * their own initialization and read APIs.
 */
export abstract class DataEngine {
  /** DI token for resolving the abstract data engine singleton. */
  public static readonly symbol = Symbol.for('DataEngine');

  /** Plugin-owned data values keyed by PluginKey. */
  #dataTypeRegistry: Map<PluginKey, unknown> = new Map();
  /** Registration metadata keyed by PluginKey. */
  #dataTypeOptions: Map<PluginKey, DataEngineRegistrationOptions> = new Map();
  /** Data view field selectors grouped by named read model. */
  #dataViewFields: Map<string, Map<string, RegisteredDataEngineViewField>> = new Map();
  #writeToken: object | undefined;

  /** Initializes engine-owned registries or projections. */
  abstract initialize(): void;

  /** Restricts registered state and view changes to the owning runtime after setup. */
  enforceWriteBoundary(token: object): void {
    if (this.#writeToken) throw new SearError('DataEngine write boundary is already installed.');
    this.#writeToken = token;
  }

  #assertWritable(token?: object): void {
    if (this.#writeToken && token !== this.#writeToken) {
      throw new SearError('Committed Sheet data can only change through a command transaction.');
    }
  }

  /**
   * Registers a plugin-owned data value.
   * @param key - Plugin key owning the data.
   * @param value - Data value to store.
   */
  registerDataType<StateType = unknown>(
    key: PluginKey,
    value: StateType,
    options: DataEngineRegistrationOptions<StateType> = {},
    token?: object,
  ): void {
    this.#assertWritable(token);
    const ownedOptions: DataEngineRegistrationOptions<StateType> = options.dataView
      ? Object.freeze({ dataView: Object.freeze(options.dataView.map((field) => Object.freeze({ ...field }))) })
      : Object.freeze({});
    this.#dataTypeRegistry.set(key, value);
    this.#dataTypeOptions.set(key, ownedOptions);
    ownedOptions.dataView?.forEach((field) => this.registerDataViewField(key, field, token));
  }

  /**
   * Replaces a plugin-owned data value.
   * @param key - Plugin key owning the data.
   * @param value - New data value.
   */
  replaceDataType(key: PluginKey, value: unknown, token?: object): void {
    this.#assertWritable(token);
    this.#dataTypeRegistry.set(key, value);
  }

  /**
   * Reports whether a plugin state has been registered with this engine.
   * @param key - Plugin key to inspect.
   * @returns True when the key owns a DataEngine-visible state value.
   */
  hasDataType(key: PluginKey): boolean {
    return this.#dataTypeRegistry.has(key);
  }

  /**
   * Retrieves a plugin-owned data value.
   * @param key - Plugin key to read.
   * @returns Registered value, or void 0 when absent.
   */
  getDataType<T = unknown>(key: PluginKey): T | undefined {
    return this.#dataTypeRegistry.get(key) as T | undefined;
  }

  /**
   * Reads registration metadata for a plugin-owned data value.
   * @param key - Plugin key to inspect.
   * @returns Registration metadata, or void 0 when the key is not registered.
   */
  getDataTypeOptions(key: PluginKey): DataEngineRegistrationOptions | undefined {
    return this.#dataTypeOptions.get(key);
  }

  /**
   * Resolves a transport-safe plugin-key string to the registered key object.
   *
   * PluginKey construction intentionally creates a unique identity, so remote
   * transports must resolve the received string back to this registry's
   * existing key before creating a transaction for PluginManager.
   * @param key - Stable key string carried by a transport message.
   * @returns Registered PluginKey, or void 0 when no state owner has that key.
   */
  getRegisteredDataTypeKey(key: string): PluginKey | undefined {
    return [...this.#dataTypeRegistry.keys()].find((registeredKey) => registeredKey.key === key);
  }

  /**
   * Registers one field selector for a named data view.
   * @param ownerKey - Plugin key whose current state feeds the selector.
   * @param field - Named view field selector.
   * @throws DataViewFieldDuplicateError when another owner already registered the same field in the same view.
   */
  registerDataViewField<StateType = unknown>(
    ownerKey: PluginKey,
    field: DataEngineViewFieldRegistration<StateType>,
    token?: object,
  ): void {
    this.#assertWritable(token);
    const viewFields = this.#dataViewFields.get(field.viewKey) ?? new Map<string, RegisteredDataEngineViewField>();
    const existing = viewFields.get(field.fieldKey);
    if (existing && existing.ownerKey.key !== ownerKey.key) {
      throw new DataViewFieldDuplicateError({
        viewKey: field.viewKey,
        fieldKey: field.fieldKey,
        existingOwnerKey: existing.ownerKey.key,
        ownerKey: ownerKey.key,
      });
    }
    viewFields.set(field.fieldKey, {
      ownerKey,
      fieldKey: field.fieldKey,
      select: field.select as (state: unknown) => unknown,
      required: field.required !== false,
    });
    this.#dataViewFields.set(field.viewKey, viewFields);
  }

  /**
   * Reads one field from a named data view without materializing the whole view.
   * @param viewKey - Named data view containing the field.
   * @param fieldKey - Field to read.
   * @returns Field value, or void 0 when the field is unregistered or unavailable.
   */
  readDataViewField<FieldType = unknown>(viewKey: string, fieldKey: string): FieldType | undefined {
    const field = this.#dataViewFields.get(viewKey)?.get(fieldKey);
    if (!field) return void 0;
    const state = this.#dataTypeRegistry.get(field.ownerKey);
    if (state === void 0) return void 0;
    const value = field.select(state);
    return value === void 0 ? void 0 : (value as FieldType);
  }

  /**
   * Lists fields registered for one named data view.
   * @param viewKey - Named data view to inspect.
   * @returns Field names in registration order.
   */
  getDataViewFieldKeys(viewKey: string): string[] {
    return [...(this.#dataViewFields.get(viewKey)?.keys() ?? [])];
  }

  // // Register state
  // registerState(key: string, state: unknown): void {
  //     this.stateRegistry[key] = state;
  // }

  // // Get state
  // getState(key: string): unknown | undefined {
  //     return this.stateRegistry[key];
  // }

  // abstract getDimension(...args: unknown[]): unknown;
  // abstract getItem(...args: unknown[]): unknown;
}

export { DataViewFieldDuplicateError } from './DataViewFieldDuplicateError';
