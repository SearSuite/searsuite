import { createMoveRowOTOperation } from '@searsuite/sear-domain-ot';
import {
  PluginKey,
  SheetFormatTransferRegistry,
  createMatrixFormatTransfer,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
} from '../src';

describe('Sheet contribution ownership', () => {
  const range = { start: [0, 0], end: [0, 0] } as const;
  const target = new PluginKey('contribution-owner');

  it('keeps a retained range-move contribution from replacing its plan or registration identity', () => {
    const registry = new SheetRangeMoveRegistry();
    const contribution = { id: 'move', plan: () => [{ target, operations: [] }] };
    const dispose = registry.register(contribution);
    Object.assign(contribution, { id: 'forged', plan: () => [] });

    expect(registry.plan({ source: range, destination: range })).toEqual([{ target, operations: [] }]);
    dispose();
    expect(registry.plan({ source: range, destination: range })).toEqual([]);
  });

  it('keeps a retained structure-move contribution from replacing its transform', () => {
    const registry = new SheetStructureMoveRegistry();
    const operation = createMoveRowOTOperation([0], [1]);
    const contribution = { id: 'structure', transformOperations: () => [operation, operation] };
    const dispose = registry.register(contribution);
    Object.assign(contribution, { id: 'forged', transformOperations: () => [] });

    expect(registry.plan({ target, operations: [operation] })).toEqual([operation, operation]);
    dispose();
    expect(registry.plan({ target, operations: [operation] })).toEqual([operation]);
  });

  it('keeps a retained range-reorder contribution from replacing its plan', () => {
    const registry = new SheetRangeReorderRegistry();
    const contribution = { id: 'reorder', plan: () => [{ target, operations: [] }] };
    const dispose = registry.register(contribution);
    Object.assign(contribution, { id: 'forged', plan: () => [] });

    expect(registry.plan({ range, destinationOf: (row) => row })).toEqual([{ target, operations: [] }]);
    dispose();
    expect(registry.plan({ range, destinationOf: (row) => row })).toEqual([]);
  });

  it('keeps format owner and captured plan callbacks fixed after registration', () => {
    const registry = new SheetFormatTransferRegistry();
    const snapshot = { plan: () => [{ target, operations: [] }] };
    const owner = { id: 'format', capture: () => snapshot, clear: () => [{ target, operations: [] }] };
    const dispose = registry.register(owner);
    const captured = registry.capture(range);
    Object.assign(owner, { id: 'forged', capture: () => ({ plan: () => [] }), clear: () => [] });
    Object.assign(snapshot, { plan: () => [] });

    expect(captured.plan(range)).toEqual([{ target, operations: [] }]);
    expect(registry.clear(range)).toEqual([{ target, operations: [] }]);
    dispose();
    expect(registry.clear(range)).toEqual([]);
  });

  it('round-trips owner format snapshots through JSON for clipboard transfer', () => {
    const values = new Map([['0:0', '#ffdddd']]);
    const registry = new SheetFormatTransferRegistry();
    registry.register(createMatrixFormatTransfer('fill', target, () => ({
      getItem: (row, column) => values.get(`${row}:${column}`) ?? null,
      forEachStoredInRange: (sr, sc, er, ec, visit) => values.forEach((value, key) => {
        const [row, column] = key.split(':').map(Number);
        if (row >= sr && row <= er && column >= sc && column <= ec) visit(value, row, column);
      }),
    })));

    const portable = JSON.parse(JSON.stringify(registry.capturePortable(range)));
    expect(registry.planPortable(portable, { start: [1, 1], end: [1, 1] })).toEqual([
      { target, operations: [{ p: [1, 1], uc: { value: '#ffdddd', prev: null } }] },
    ]);
    expect(registry.clear(range)).toEqual([
      { target, operations: [{ p: [0, 0], uc: { value: null, prev: '#ffdddd' } }] },
    ]);
  });

  it('combines format extents and keeps fill hints owned by their registered contributor', () => {
    const registry = new SheetFormatTransferRegistry();
    const first = { id: 'fill', usedExtent: () => [19, 3] as const, singleCellFillStep: () => 1 };
    const dispose = registry.register(first);
    registry.register({ id: 'border', usedExtent: () => [4, 8] as const });
    Object.assign(first, { usedExtent: () => [0, 0], singleCellFillStep: () => 7 });

    expect(registry.usedExtent(199, 99)).toEqual([19, 8]);
    expect(registry.singleCellFillStep(0, 0)).toBe(1);
    dispose();
    expect(registry.usedExtent(199, 99)).toEqual([4, 8]);
    expect(registry.singleCellFillStep(0, 0)).toBeNull();
  });
});
