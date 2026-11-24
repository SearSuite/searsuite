import { XmlXPathError, XmlXPathErrorCode } from './XmlXPathError';
import { type XmlXPathEvaluation, type XmlXPathOptions } from './XmlXPathTypes';
import { type XmlDocumentParser } from './XmlDocumentParser';
import { type XmlXPathEngine } from './XmlXPathEngine';

/** Platform-neutral XML/XPath execution boundary used by formula adapters. */
export class XmlXPathEvaluator {
  readonly #parser: XmlDocumentParser;
  readonly #engine: XmlXPathEngine;

  /** DI token for resolving the editor-local XML/XPath adapter. */
  public static readonly symbol: symbol = Symbol.for('XmlXPathEvaluator');

  public constructor(
    parser: XmlDocumentParser,
    engine: XmlXPathEngine,
  ) {
    this.#parser = parser;
    this.#engine = engine;
  }

  /** Evaluates an XPath expression against one XML document. */
  public evaluate(xml: string, xpath: string, options: XmlXPathOptions = {}): XmlXPathEvaluation {
    if (xml.trim().length === 0 || /<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
      throw new XmlXPathError(XmlXPathErrorCode.InvalidXml, 'XML must be non-empty and contain no DTD declarations.', {
        xpath,
      });
    }
    return this.#engine.evaluate(this.#parser.parse(xml), xpath, options);
  }
}
