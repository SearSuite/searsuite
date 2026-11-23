import { Injectable } from '@searsuite/sear-foundation-di';

import { DataStorageFactory } from './DataStorageFactory';
import { MapDataStorage } from './MapDataStorage';

/** MapDataStorageFactory public API. */
@Injectable()
export class MapDataStorageFactory<U, T> implements DataStorageFactory<MapDataStorage<U, T>> {
  /** Creates the value. */
  create(): MapDataStorage<U, T> {
    return new MapDataStorage<U, T>();
  }
}
