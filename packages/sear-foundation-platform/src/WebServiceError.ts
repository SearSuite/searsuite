import { SearError } from '@searsuite/sear-foundation-error';

export const WebServiceErrorCode = {
  RequestFailed: 'WEB_SERVICE_REQUEST_FAILED',
} as const;

export type WebServiceErrorCode = (typeof WebServiceErrorCode)[keyof typeof WebServiceErrorCode];

/** Public error raised by a web-service adapter. */
export class WebServiceError extends SearError {
  public readonly code = WebServiceErrorCode.RequestFailed;

  public constructor(message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message, details);
  }
}
