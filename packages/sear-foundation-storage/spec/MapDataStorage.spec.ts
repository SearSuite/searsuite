import { DataStorage, MapDataStorageFactory } from '../src';

describe('MapDataStorageFactory', () => {
  it('creates isolated key-value stores with get, set and delete semantics', () => {
    const factory = new MapDataStorageFactory<string, number>();
    const first = factory.create();
    const second = factory.create();

    first.set('answer', 42);
    expect(first.get('answer')).toBe(42);
    expect(second.get('answer')).toBe(void 0);

    first.delete('answer');
    expect(first.get('answer')).toBe(void 0);
    expect(DataStorage.symbol).toBe(Symbol.for('DataStorage'));
  });
});
