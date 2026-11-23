import { SearError } from '@searsuite/sear-foundation-error';

export const XmlXPathErrorCode = {
  InvalidXml: 'XML_INVALID',
  InvalidXPath: 'XPATH_INVALID',
  UnsupportedResult: 'XPATH_UNSUPPORTED_RESULT',
} as const;

export type XmlXPathErrorCode = (typeof XmlXPathErrorCode)[keyof typeof XmlXPathErrorCode];

/** Public failure raised by XML/XPath adapters. */
export class XmlXPathError extends SearError {
  public constructor(
    public readonly code: XmlXPathErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message, details);
  }
}
