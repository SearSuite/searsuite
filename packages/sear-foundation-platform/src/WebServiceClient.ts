import { type WebServiceRequestOptions, type WebServiceResponse } from './WebServiceTypes';

/** Platform-neutral asynchronous HTTP boundary for service-backed formulas. */
export abstract class WebServiceClient {
  /** DI token for resolving the editor-local web-service adapter. */
  public static readonly symbol: symbol = Symbol.for('WebServiceClient');

  /** Performs one request; callers own caching, cancellation, and invalidation. */
  public abstract request(url: string, options?: WebServiceRequestOptions): Promise<WebServiceResponse>;
}
