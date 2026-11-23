import { type Platform } from '@searsuite/sear-foundation-platform';
import { SubscriptionManager } from '../src/SubscriptionManager';

describe('SubscriptionManager', () => {
  it('disposes every tracked subscription exactly once', () => {
    const stopResize = jest.fn();
    const platform = {
      observeResize: jest.fn(() => stopResize),
    } as unknown as Platform;
    const subscriptionManager = new SubscriptionManager(platform);

    subscriptionManager.observeResize({}, jest.fn());
    subscriptionManager.destroy();
    subscriptionManager.destroy();

    expect(stopResize).toHaveBeenCalledTimes(1);
  });

  it('can dispose one subscription before the manager is destroyed', () => {
    const stopResize = jest.fn();
    const platform = {
      observeResize: jest.fn(() => stopResize),
    } as unknown as Platform;
    const subscriptionManager = new SubscriptionManager(platform);

    const stop = subscriptionManager.observeResize({}, jest.fn());
    stop();
    stop();
    subscriptionManager.destroy();

    expect(stopResize).toHaveBeenCalledTimes(1);
  });
});
