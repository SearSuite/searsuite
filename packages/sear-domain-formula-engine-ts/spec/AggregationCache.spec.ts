import { AggregationCache } from '../src/AggregationCache';

describe('AggregationCache', () => {
  let cache: AggregationCache;

  beforeEach(() => {
    cache = new AggregationCache();
  });

  it('does not expose mutable aggregate entries through a retained cache handle', () => {
    cache.enforceCommandBoundary(() => false);
    const retained = cache as unknown as Record<string, unknown>;

    expect(retained['getOrCreateEntry']).toBeUndefined();
    expect(() => cache.setSum(0, 0, 2, 0, 60)).toThrow('editor.commands.run');
    expect(cache.getSum(0, 0, 2, 0)).toBeNaN();
  });

  describe('getSum', () => {
    it('returns NaN for uncached range', () => {
      const sum = cache.getSum(0, 0, 2, 0);
      expect(isNaN(sum)).toBe(true);
    });

    it('returns cached sum after setSum', () => {
      cache.setSum(0, 0, 2, 0, 60);
      expect(cache.getSum(0, 0, 2, 0)).toBe(60);
    });

    it('returns NaN after clear', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.clear();
      expect(isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
    });
  });

  describe('getCount', () => {
    it('returns NaN for uncached range', () => {
      const count = cache.getCount(0, 0, 2, 0);
      expect(isNaN(count)).toBe(true);
    });

    it('returns NaN after only setSum', () => {
      cache.setSum(0, 0, 2, 0, 60);
      expect(Number.isNaN(cache.getCount(0, 0, 2, 0))).toBe(true);
    });

    it('returns cached count after setCount', () => {
      cache.setCount(0, 0, 2, 0, 3);
      expect(cache.getCount(0, 0, 2, 0)).toBe(3);
    });

    it('returns NaN after clear', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.clear();
      expect(isNaN(cache.getCount(0, 0, 2, 0))).toBe(true);
    });
  });

  describe('onCellChanged', () => {
    it('incremental update: newSum = oldSum - oldVal + newVal', () => {
      cache.setSum(0, 0, 2, 0, 60); // A1+A2+A3 = 10+20+30 = 60
      cache.onCellChanged(1, 0, 20, 50); // A2: 20 → 50
      expect(cache.getSum(0, 0, 2, 0)).toBe(90); // 60 - 20 + 50
    });

    it('ignores if entry is already dirty', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.onCellChanged(1, 0, 20, { kind: 'error', code: '#DIV/0!' }); // makes it dirty
      cache.onCellChanged(1, 0, { kind: 'error', code: '#DIV/0!' }, 50); // should hit if (entry.isDirty) continue;
      expect(Number.isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
    });

    it('updates existing entry when setSum is called again', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.setSum(0, 0, 2, 0, 100);
      expect(cache.getSum(0, 0, 2, 0)).toBe(100);
    });

    it('invalidates the numeric cache when an error value is introduced as oldVal', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.onCellChanged(1, 0, { kind: 'error', code: '#DIV/0!' }, 20);
      expect(Number.isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
    });

    it('invalidates the numeric cache when an error value is introduced as newVal', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.onCellChanged(1, 0, 20, { kind: 'error', code: '#DIV/0!' });
      expect(Number.isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
    });

    it('ignores referenced numeric text', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.onCellChanged(1, 0, 20, '50');
      expect(cache.getSum(0, 0, 2, 0)).toBe(40);
    });

    it('ignores referenced booleans', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.onCellChanged(1, 0, 20, true);
      expect(cache.getSum(0, 0, 2, 0)).toBe(40);
    });

    it('does not update a range that does not contain the changed cell', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.setSum(0, 1, 2, 1, 15);

      cache.onCellChanged(1, 0, 20, 50);

      expect(cache.getSum(0, 0, 2, 0)).toBe(90);
      expect(cache.getSum(0, 1, 2, 1)).toBe(15);
    });

    it('invalidates a range when non-coercible text is introduced as oldVal', () => {
      cache.setSum(0, 0, 2, 0, 60);

      cache.onCellChanged(
        1,
        0,
        {
          kind: 'text',
          value: '13800138000',
          numericCoercion: 'deny',
        },
        20,
      );

      expect(Number.isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
    });

    it('invalidates a range when non-coercible text is introduced as newVal', () => {
      cache.setSum(0, 0, 2, 0, 60);

      cache.onCellChanged(1, 0, 20, {
        kind: 'text',
        value: '13800138000',
        numericCoercion: 'deny',
      });

      expect(Number.isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
    });

    it('invalidates count when changing from numeric to non-numeric', () => {
      cache.setCount(0, 0, 2, 0, 3);
      cache.onCellChanged(1, 0, 20, true);
      expect(Number.isNaN(cache.getCount(0, 0, 2, 0))).toBe(true);
    });

    it('invalidates count when changing from non-numeric to numeric', () => {
      cache.setCount(0, 0, 2, 0, 2);
      cache.onCellChanged(1, 0, true, 20);
      expect(Number.isNaN(cache.getCount(0, 0, 2, 0))).toBe(true);
    });
  });

  describe('onStructureChanged', () => {
    it('clears all cache on structure change', () => {
      cache.setSum(0, 0, 2, 0, 60);
      cache.setSum(0, 1, 2, 1, 30);
      cache.onStructureChanged();
      expect(isNaN(cache.getSum(0, 0, 2, 0))).toBe(true);
      expect(isNaN(cache.getSum(0, 1, 2, 1))).toBe(true);
    });
  });
});
