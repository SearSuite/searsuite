/** @jest-environment node */

import { WebServiceError } from '@searsuite/sear-foundation-platform';
import { NodeWebServiceClient } from '../src';

describe.each([NodeWebServiceClient])('web-service transport %p', (Implementation) => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a consumed platform-neutral response and forwards request headers', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => '<root/>',
    } as Response);
    const response = await new Implementation().request('https://example.test', { headers: { Accept: 'text/xml' } });
    expect(response).toEqual({ status: 200, ok: true, text: '<root/>' });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test',
      expect.objectContaining({ headers: { Accept: 'text/xml' } }),
    );
  });

  it('keeps cancellation subscribed through body consumption and releases it afterward', async () => {
    let cancel: (() => void) | undefined;
    let finish: ((value: string) => void) | undefined;
    const dispose = jest.fn();
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      text: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    } as Response);
    const request = new Implementation().request('https://example.test', {
      cancellation: {
        cancelled: false,
        subscribe(listener) {
          cancel = listener;
          return dispose;
        },
      },
    });
    await Promise.resolve();
    cancel?.();
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    finish?.('done');
    await request;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('wraps transport failures with a stable public error', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(new Implementation().request('https://example.test')).rejects.toBeInstanceOf(WebServiceError);
  });
});
