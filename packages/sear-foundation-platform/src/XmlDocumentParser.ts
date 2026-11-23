/** Parses XML into an opaque document understood by the paired XPath engine. */
export abstract class XmlDocumentParser {
  public static readonly symbol: symbol = Symbol.for('XmlDocumentParser');

  public abstract parse(xml: string): unknown;
}
