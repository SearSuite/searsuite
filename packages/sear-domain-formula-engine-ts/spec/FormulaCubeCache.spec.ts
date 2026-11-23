import { FormulaServiceCacheStatus, type FormulaCubeQuery } from '@searsuite/sear-domain-formula-engine';
import { FormulaCubeCache } from '../src';

const query: FormulaCubeQuery = { kind: 'member', connection: 'Sales', expression: '[Time].[2004]' };

describe('FormulaCubeCache', () => {
  it('deduplicates equivalent queries and publishes ready results', async () => {
    const loader = jest.fn(async () => ({
      kind: 'cube-member' as const,
      connection: 'Sales',
      expression: '[Time].[2004]',
      caption: 'FY 2004',
    }));
    const cache = new FormulaCubeCache(loader);
    const invalidated = jest.fn();
    cache.subscribeInvalidation(invalidated);

    const first = cache.load(query);
    const second = cache.load({ ...query });
    expect(first).toBe(second);
    expect(cache.read(query)).toEqual({ status: FormulaServiceCacheStatus.Pending });
    await first;

    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.read({ ...query })).toEqual({
      status: FormulaServiceCacheStatus.Ready,
      value: expect.objectContaining({ kind: 'cube-member', caption: 'FY 2004' }),
    });
    expect(invalidated).toHaveBeenCalledTimes(1);
  });

  it('drops stale requests after clear', async () => {
    let resolve!: (value: string) => void;
    const cache = new FormulaCubeCache(() => new Promise((done) => { resolve = done; }));
    const pending = cache.load({ kind: 'member-property', connection: 'Sales', member: '[Time].[2004]', property: 'Name' });
    await Promise.resolve();
    cache.clear();
    resolve('FY 2004');
    await pending;
    expect(cache.read({ kind: 'member-property', connection: 'Sales', member: '[Time].[2004]', property: 'Name' })).toEqual({ status: FormulaServiceCacheStatus.Unavailable });
  });
});
