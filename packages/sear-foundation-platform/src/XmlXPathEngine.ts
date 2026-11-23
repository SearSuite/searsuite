import { type XmlXPathEvaluation, type XmlXPathOptions } from './XmlXPathTypes';

/** Queries documents produced by the paired XML parser. */
export abstract class XmlXPathEngine {
  public static readonly symbol: symbol = Symbol.for('XmlXPathEngine');

  public abstract evaluate(document: unknown, xpath: string, options: XmlXPathOptions): XmlXPathEvaluation;
}
