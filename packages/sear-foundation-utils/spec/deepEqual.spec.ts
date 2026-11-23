import { deepEqual } from '../src';

describe('deepEqual', () => {
  it('compares nested cell values independently of object key order', () => {
    expect(
      deepEqual(
        { type: 'text', value: { text: 'A', marks: ['bold'] } },
        { value: { marks: ['bold'], text: 'A' }, type: 'text' },
      ),
    ).toBe(true);
    expect(deepEqual({ value: { marks: ['bold'] } }, { value: { marks: ['italic'] } })).toBe(false);
    expect(deepEqual([1, { value: null }], [1, { value: undefined }])).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(true);
    expect(
      deepEqual(Object.assign(Object.create(null), { value: 'A' }), Object.assign(Object.create(null), { value: 'A' })),
    ).toBe(true);
  });

  it('compares Map values deeply and Set members by identity', () => {
    const key = { id: 1 };
    expect(deepEqual(new Map([[key, { value: [1, 2] }]]), new Map([[key, { value: [1, 2] }]]))).toBe(true);
    expect(deepEqual(new Map([[key, 1]]), new Map([[{ id: 1 }, 1]]))).toBe(false);
    expect(deepEqual(new Set([key]), new Set([key]))).toBe(true);
    expect(deepEqual(new Set([key]), new Set([{ id: 1 }]))).toBe(false);
  });

  it('compares dates, expressions, and binary values', () => {
    expect(deepEqual(new Date('2024-01-01'), new Date('2024-01-01'))).toBe(true);
    expect(deepEqual(new Date('2024-01-01'), new Date('2024-01-02'))).toBe(false);
    expect(deepEqual(/cell/gi, /cell/gi)).toBe(true);
    expect(deepEqual(/cell/g, /cell/i)).toBe(false);
    expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(deepEqual(new DataView(new Uint8Array([1, 2]).buffer), new DataView(new Uint8Array([1, 2]).buffer))).toBe(
      true,
    );
    expect(deepEqual(new DataView(new Uint8Array([1, 2]).buffer), new DataView(new Uint8Array([1, 3]).buffer))).toBe(
      false,
    );
  });
});
