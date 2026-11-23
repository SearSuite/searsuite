import { DataStorage } from './DataStorage';

/** Map-backed DataStorage implementation. */
export class MapDataStorage<U, T> extends DataStorage<U, T, Map<U, T>> {
  /** Creates a MapDataStorage instance. */
  constructor() {
    super(new Map<U, T>());
  }

  /** Returns the value. */
  get(key: U): T | undefined {
    return this.data.get(key);
  }

  /** Updates the value. */
  set(key: U, value: T): void {
    this.data.set(key, value);
  }

  /** Deletes the requested entry. */
  delete(key: U): void {
    this.data.delete(key);
  }
}
