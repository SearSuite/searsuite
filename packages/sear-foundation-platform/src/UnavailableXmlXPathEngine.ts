import { XmlXPathEngine } from './XmlXPathEngine';
import { XmlXPathError, XmlXPathErrorCode } from './XmlXPathError';
import { type XmlXPathEvaluation, type XmlXPathOptions } from './XmlXPathTypes';
import { Injectable } from '@searsuite/sear-foundation-di';

/** Host-neutral fallback when no XPath engine was supplied. */
@Injectable()
export class UnavailableXmlXPathEngine extends XmlXPathEngine {
  public evaluate(_document: unknown, _xpath: string, _options: XmlXPathOptions): XmlXPathEvaluation {
    throw new XmlXPathError(XmlXPathErrorCode.InvalidXPath, 'XPath evaluation is unavailable in this host.');
  }
}
