import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { Rect } from '@searsuite/sear-foundation-rect';
import { adoptCommittedPluginState } from '@searsuite/sear-assembly-sheet-state';

it('detaches a retained matrix handle while sharing locked sparse storage', () => {
  class OpaqueMatrix extends CSRMatrix<number> {
    #hidden = 1;
    public readHidden(): number {
      return this.#hidden;
    }
    public changeHidden(value: number): void {
      this.#hidden = value;
    }
  }
  const matrix = new OpaqueMatrix(void 0, [1, 1]);
  matrix.addItem(0, 0, 4);

  const adopted = adoptCommittedPluginState({ matrix });
  matrix.changeHidden(9);

  expect(adopted.matrix).not.toBe(matrix);
  expect((adopted.matrix as unknown as { data: number[] }).data).toBe((matrix as unknown as { data: number[] }).data);
  expect(adopted.matrix.getItem(0, 0)).toBe(4);
  expect(() => matrix.addItem(0, 0, 8)).toThrow('Committed matrix state');
  expect(() => adopted.matrix.changeHidden(8)).toThrow();
});

it('takes an independent immutable snapshot of plain state', () => {
  const state = { definitions: [{ id: 'first' }] };
  const adopted = adoptCommittedPluginState(state);

  expect(adopted).not.toBe(state);
  expect(adopted.definitions).not.toBe(state.definitions);
  expect(() => {
    state.definitions[0].id = 'changed';
  }).toThrow();
});

it('does not retain a plugin proxy that reads mutable external data', () => {
  const external = { value: 1 };
  const state = new Proxy<{ stored: number; value?: number }>(
    { stored: 1 },
    {
      get(target, key, receiver) {
        return key === 'value' ? external.value : Reflect.get(target, key, receiver);
      },
    },
  );

  const adopted = adoptCommittedPluginState(state);
  external.value = 9;

  expect(state.value).toBe(9);
  expect(adopted.stored).toBe(1);
  expect(adopted.value).toBeUndefined();
  expect(() => {
    adopted.stored = 9;
  }).toThrow();
});

it('does not retain virtual properties in sparse values or matrix metadata', () => {
  class ExtensionMatrix extends CSRMatrix<{ stored: number; virtual?: number }> {
    public metadata: { stored: number; virtual?: number };
    public constructor(metadata: { stored: number; virtual?: number }) {
      super(void 0, [1, 1]);
      this.metadata = metadata;
    }
  }
  const external = { value: 1 };
  const proxy = new Proxy<{ stored: number; virtual?: number }>(
    { stored: 1 },
    {
      get(target, key, receiver) {
        return key === 'virtual' ? external.value : Reflect.get(target, key, receiver);
      },
    },
  );
  const matrix = new ExtensionMatrix(proxy);
  matrix.addItem(0, 0, proxy);

  const adopted = adoptCommittedPluginState({ matrix });
  external.value = 9;

  expect(proxy.virtual).toBe(9);
  expect(adopted.matrix.getItem(0, 0)?.virtual).toBeUndefined();
  expect(adopted.matrix.metadata.virtual).toBeUndefined();
  expect(adopted.matrix.getItem(0, 0)?.stored).toBe(1);
});

it('does not trust a plugin-supplied matrix lock flag or frozen storage', () => {
  const matrix = new CSRMatrix<number>({ data: [4], indices: [0, 1], indptr: [0] }, [1, 1]);
  const retained = matrix as unknown as {
    data: number[];
    indices: number[];
    indptr: number[];
    mutationsLocked: boolean;
  };
  Object.freeze(retained.data);
  Object.freeze(retained.indices);
  Object.freeze(retained.indptr);
  retained.mutationsLocked = true;

  const adopted = adoptCommittedPluginState({ matrix });
  const current = adopted.matrix as unknown as { data: number[] };

  expect(() => {
    current.data = [9];
  }).toThrow();
  expect(adopted.matrix.getItem(0, 0)).toBe(4);
  expect(() => matrix.addItem(0, 0, 9)).toThrow('Committed matrix state');
});

it('does not retain dynamic rectangle coordinates from a plugin', () => {
  let coordinate = 1;
  const point = [1, 0] as [number, number];
  Object.defineProperty(point, 0, { get: () => coordinate, configurable: true });
  const rect = Object.freeze(new Rect([point, [2, 2]]));

  const adopted = adoptCommittedPluginState({ rect });
  coordinate = 9;

  expect(adopted.rect.getPoint(0)).toEqual([1, 0]);
  expect(adopted.rect.shape).toEqual([
    [1, 0],
    [2, 2],
  ]);
});
