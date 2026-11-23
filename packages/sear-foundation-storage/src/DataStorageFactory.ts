/** Factory contract for creating data storage instances. */
export abstract class DataStorageFactory<T> {
  // public static readonly symbol: symbol = Symbol.for('DataStorageFactory');
  /** Creates the value. */
  abstract create(): T;
}
