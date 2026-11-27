import { lockCommittedSheetState } from '@searsuite/sear-assembly-sheet-state';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { Rect } from '@searsuite/sear-foundation-rect';

it('locks a matrix even when an extension overrides the lock hook', () => {
  const matrix = new CSRMatrix<number>({ data: [], indices: [0], indptr: [] }, [1, 1]);
  Object.defineProperty(matrix, 'lockMutations', { value: () => void 0, configurable: true });

  lockCommittedSheetState({ matrix });

  expect(() => matrix.addItem(0, 0, 7)).toThrow('Committed matrix state');
  expect(matrix.getItem(0, 0)).toBeNull();
});

it('locks extra persisted fields on matrix subclasses without disabling listeners', () => {
  class ExtensionMatrix extends CSRMatrix<number> {
    public metadata = { label: 'initial' };
  }
  const matrix = new ExtensionMatrix({ data: [], indices: [0], indptr: [] }, [1, 1]);
  const listener = jest.fn();

  lockCommittedSheetState({ matrix });

  expect(() => {
    matrix.metadata.label = 'changed';
  }).toThrow();
  expect(() => {
    matrix.metadata = { label: 'changed' };
  }).toThrow();
  matrix.addListener(listener);
  matrix.removeListener(listener);
  expect(matrix.metadata.label).toBe('initial');
});

it('rejects opaque extension state even when it claims to lock mutations', () => {
  class OpaqueState {
    readonly #values = new Map<string, number>();
    public lockMutations(): void {}
    public set(value: number): void {
      this.#values.set('value', value);
    }
  }

  expect(() => lockCommittedSheetState({ state: new OpaqueState() })).toThrow('plain data');
});

it('locks standard rectangle state without trusting an overridden lock hook', () => {
  const rect = new Rect([
    [1, 1],
    [2, 2],
  ]);
  Object.defineProperty(rect, 'lockMutations', { value: () => void 0, configurable: true });

  lockCommittedSheetState({ rect });

  expect(() => {
    rect.getPoint(0)[0] = 9;
  }).toThrow();
  expect(rect.getPoint(0)).toEqual([1, 1]);
});

it('locks coordinates held by an extension even when the rectangle was frozen first', () => {
  const rect = Object.freeze(
    new Rect([
      [1, 1],
      [2, 2],
    ]),
  );
  const retainedPoint = rect.getPoint(0);

  lockCommittedSheetState({ rect });

  expect(() => {
    retainedPoint[0] = 9;
  }).toThrow();
  expect(rect.getPoint(0)).toEqual([1, 1]);
});

it('locks a frozen empty rectangle without freezing the shared sentinel', () => {
  const rect = Object.freeze(new Rect());
  const retainedPoint = rect.getPoint(0);

  lockCommittedSheetState({ rect });

  expect(() => {
    retainedPoint[0] = 9;
  }).toThrow();
  expect(rect.getPoint(0)).toEqual([-1, -1]);
});

it('rejects function-valued committed state that can mutate retained closures', () => {
  let value = 1;
  const state = {
    change: () => {
      value = 2;
    },
  };

  expect(() => lockCommittedSheetState(state)).toThrow('functions');
  expect(value).toBe(1);
});
