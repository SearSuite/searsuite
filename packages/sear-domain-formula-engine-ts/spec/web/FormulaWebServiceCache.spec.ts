/** @jest-environment node */
import { FormulaWebServiceDefinition } from '@searsuite/sear-domain-formula-engine';
import { FormulaExternalServiceRegistry, FormulaWebServiceCache } from '../../src';
import { valueError } from './WebFormulaTestHarness';

describe('FormulaWebServiceCache', () => {
  it('deduplicates concurrent loads and publishes ready values to the registry', async () => {
    const loader = jest.fn(async (url: string) => url);
    const cache = new FormulaWebServiceCache(loader);
    const registry = new FormulaExternalServiceRegistry();
    const listener = jest.fn();
    registry.subscribeInvalidation(listener);
    registry.register(FormulaWebServiceDefinition, cache);
    listener.mockClear();
    const request = cache.load('https://example.com/one');
    expect(cache.load('https://example.com/one')).toBe(request);
    await Promise.all([request, cache.load('https://example.com/two')]);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.read('https://example.com/one')).toEqual({ status: 'ready', value: 'https://example.com/one' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith([FormulaWebServiceDefinition.id]);
    registry.destroy();
    cache.destroy();
  });

  it('caches failures as #VALUE! and allows explicit host retry', async () => {
    const loader = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockResolvedValueOnce('recovered');
    const cache = new FormulaWebServiceCache(loader);
    await cache.load('https://example.com/failure');
    expect(cache.read('https://example.com/failure')).toEqual({ status: 'ready', value: valueError });
    await cache.load('https://example.com/failure');
    expect(cache.read('https://example.com/failure')).toEqual({ status: 'ready', value: 'recovered' });
    cache.destroy();
  });

  it('does not call the transport for unsupported URLs', async () => {
    const loader = jest.fn(async () => 'response');
    const cache = new FormulaWebServiceCache(loader);
    await cache.load('file:///tmp/file.xml');
    expect(loader).not.toHaveBeenCalled();
    expect(cache.read('file:///tmp/file.xml')).toEqual({ status: 'ready', value: valueError });
    cache.destroy();
  });

  it('drops late responses after clear and destroy without invalidating destroyed hosts', async () => {
    const resolvers: Array<(text: string) => void> = [];
    const cache = new FormulaWebServiceCache(() => new Promise((resolve) => resolvers.push(resolve)));
    const listener = jest.fn();
    cache.subscribeInvalidation(listener);
    const oldRequest = cache.load('https://example.com');
    await Promise.resolve();
    cache.clear();
    const currentRequest = cache.load('https://example.com');
    await Promise.resolve();
    resolvers[0]('old');
    await oldRequest;
    expect(cache.read('https://example.com')).toEqual({ status: 'pending' });
    cache.destroy();
    resolvers[1]('new');
    await currentRequest;
    expect(cache.read('https://example.com')).toEqual({ status: 'unavailable' });
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(cache.load('https://example.com')).rejects.toThrow('destroyed');
  });
});
