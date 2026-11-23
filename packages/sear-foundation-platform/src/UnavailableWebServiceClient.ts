import { WebServiceClient } from './WebServiceClient';
import { WebServiceError } from './WebServiceError';
import { type WebServiceRequestOptions, type WebServiceResponse } from './WebServiceTypes';
import { Injectable } from '@searsuite/sear-foundation-di';

/** Host-neutral fallback when no HTTP transport was supplied. */
@Injectable()
export class UnavailableWebServiceClient extends WebServiceClient {
  public request(_url: string, _options?: WebServiceRequestOptions): Promise<WebServiceResponse> {
    return Promise.reject(new WebServiceError('Web-service requests are unavailable in this host.'));
  }
}
