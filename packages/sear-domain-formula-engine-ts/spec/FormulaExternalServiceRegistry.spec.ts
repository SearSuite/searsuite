import { defineFormulaExternalService } from '@searsuite/sear-domain-formula-engine';
import { AsyncFormulaServiceCache, FormulaExternalServiceRegistry } from '../src';

describe('FormulaExternalServiceRegistry', () => {
  it('supports tokenized replacement and service-id invalidation', () => {
    const service = defineFormulaExternalService<{ value: number }>('test');
    const registry = new FormulaExternalServiceRegistry();
    const seen: string[][] = [];
    const disposeListener = registry.subscribeInvalidation((ids) => seen.push([...ids]));
    const dispose = registry.register(service, { value: 1 });

    expect(registry.get(service)).toEqual({ value: 1 });
    dispose();
    expect(registry.get(service)).toBeUndefined();
    expect(seen).toEqual([['test'], ['test']]);
    disposeListener();
    registry.destroy();
  });

  it('binds cache invalidation, isolates listeners, and disposes subscriptions', async () => {
    const warn = jest.fn();
    const registry = new FormulaExternalServiceRegistry(warn);
    const cache = new AsyncFormulaServiceCache(async () => 'ready');
    const service = defineFormulaExternalService<typeof cache>('custom-cache', {
      subscribeInvalidation: (value, listener) => value.subscribeInvalidation(listener),
    });
    const listener = jest.fn();
    registry.subscribeInvalidation(() => {
      throw new Error('listener');
    });
    registry.subscribeInvalidation(listener);
    registry.register(service, cache);
    await cache.load('url');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
    registry.destroy();
    cache.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(() => registry.register(service, cache)).toThrow('destroyed');
  });

  it('keeps the newest registration when earlier tokens are disposed', () => {
    const definition = defineFormulaExternalService<number>('overridden');
    const registry = new FormulaExternalServiceRegistry();
    const first = registry.register(definition, 1);
    const second = registry.register(definition, 2);
    first();
    expect(registry.get(definition)).toBe(2);
    second();
    second();
    expect(registry.get(definition)).toBeUndefined();
  });

  it('requires command execution for registration and dispatches token disposal', () => {
    const definition = defineFormulaExternalService<number>('command-owned');
    const registry = new FormulaExternalServiceRegistry();
    let executing = false;
    const dispatched: number[] = [];
    registry.enforceCommandBoundary(() => executing, (id) => dispatched.push(id));
    expect(() => registry.register(definition, 1)).toThrow('commands.run');

    executing = true;
    const dispose = registry.register(definition, 1);
    executing = false;
    dispose();
    expect(dispatched).toHaveLength(1);
    expect(registry.get(definition)).toBe(1);

    executing = true;
    registry.unregisterRegistration(dispatched[0]);
    executing = false;
    expect(registry.get(definition)).toBeUndefined();
  });

  it('reserves teardown for its owner without changing service reads', () => {
    const definition = defineFormulaExternalService<number>('owned');
    const registry = new FormulaExternalServiceRegistry();
    registry.register(definition, 3);
    const token = {};
    registry.enforceTeardownBoundary(token);

    expect(() => registry.destroy()).toThrow('editor owner');
    expect(registry.get(definition)).toBe(3);
    registry.destroy(token);
    expect(registry.get(definition)).toBeUndefined();
    registry.destroy();
  });
});

describe('AsyncFormulaServiceCache', () => {
  it('deduplicates loads and invalidates after a cached result arrives', async () => {
    let loads = 0;
    const cache = new AsyncFormulaServiceCache(async (key: string) => {
      loads++;
      return `${key}-value`;
    });
    let invalidations = 0;
    cache.subscribeInvalidation(() => invalidations++);

    const first = cache.load('url');
    const second = cache.load('url');
    expect(first).toBe(second);
    expect(cache.read('url')).toEqual({ status: 'pending' });
    await first;
    expect(loads).toBe(1);
    expect(cache.read('url')).toEqual({ status: 'ready', value: 'url-value' });
    expect(invalidations).toBe(1);
  });

  it('ignores stale results after clear and destroy', async () => {
    let resolve: ((value: string) => void) | undefined;
    const cache = new AsyncFormulaServiceCache(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const pending = cache.load('url');
    await Promise.resolve();
    cache.clear();
    resolve?.('stale');
    await pending;
    expect(cache.read('url')).toEqual({ status: 'unavailable' });
    const next = cache.load('url');
    await Promise.resolve();
    cache.destroy();
    resolve?.('destroyed');
    await next;
    expect(cache.read('url')).toEqual({ status: 'unavailable' });
    await expect(cache.load('url')).rejects.toThrow('destroyed');
  });

  it('turns rejected loaders into unavailable and isolates listener failures', async () => {
    const warn = jest.fn();
    const cache = new AsyncFormulaServiceCache<string, string>(() => {
      throw new Error('request');
    }, warn);
    cache.subscribeInvalidation(() => {
      throw new Error('listener');
    });
    await cache.load('url');
    expect(cache.read('url')).toEqual({ status: 'unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
