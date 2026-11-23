import { FormulaProviderEntries } from '../src/FormulaProviderEntries';

describe('FormulaProviderEntries', () => {
  it('rejects registration when a retained registry has a forged command guard', () => {
    const entries = new FormulaProviderEntries<number>();
    Object.assign(entries, { assertCommandWrite: () => void 0 });
    entries.seal(() => false, () => void 0);

    expect(() => entries.register(1)).toThrow('editor.commands.run');
    expect(entries.getEntries()).toEqual([]);
  });

  it('keeps retained read snapshots immutable without allocating on each read', () => {
    const entries = new FormulaProviderEntries<{ get: () => number }>();
    const first = { get: () => 1 };
    const second = { get: () => 2 };
    const disposeFirst = entries.register(first);
    entries.register(second, 10);

    const snapshot = entries.getEntries();
    expect(entries.getEntries()).toBe(snapshot);
    expect(snapshot.map(({ provider }) => provider.get())).toEqual([2, 1]);
    expect(() => (snapshot as unknown as unknown[]).push({ id: 9, provider: first, priority: 100 })).toThrow();
    expect(() => { (snapshot[0] as { priority: number }).priority = -1; }).toThrow();
    expect(entries.getEntries()).toBe(snapshot);

    disposeFirst();
    expect(entries.getEntries()).not.toBe(snapshot);
    expect(entries.getEntries().map(({ provider }) => provider.get())).toEqual([2]);
  });
});
