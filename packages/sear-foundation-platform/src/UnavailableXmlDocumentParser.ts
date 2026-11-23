import { XmlDocumentParser } from './XmlDocumentParser';
import { XmlXPathError, XmlXPathErrorCode } from './XmlXPathError';
import { Injectable } from '@searsuite/sear-foundation-di';

/** Host-neutral fallback when no XML parser was supplied. */
@Injectable()
export class UnavailableXmlDocumentParser extends XmlDocumentParser {
  public parse(_xml: string): unknown {
    throw new XmlXPathError(XmlXPathErrorCode.InvalidXml, 'XML parsing is unavailable in this host.');
  }
}
