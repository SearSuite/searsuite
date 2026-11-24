import { DOMParser } from '@xmldom/xmldom';
import { Injectable } from '@searsuite/sear-foundation-di';
import { XmlDocumentParser, XmlXPathError, XmlXPathErrorCode } from '@searsuite/sear-foundation-platform';

/** Node XML parser backed by xmldom. */
@Injectable()
export class NodeXmlDocumentParser extends XmlDocumentParser {
  public static readonly symbol: symbol = Symbol.for('NodeXmlDocumentParser');

  public parse(xml: string): Document {
    let parseError: string | undefined;
    const document = new DOMParser({
      errorHandler: {
        warning: (message: string) => {
          parseError = message;
        },
        error: (message: string) => {
          parseError = message;
        },
        fatalError: (message: string) => {
          parseError = message;
        },
      },
    }).parseFromString(xml, 'application/xml');
    if (parseError) {
      throw new XmlXPathError(XmlXPathErrorCode.InvalidXml, 'XML input could not be parsed.', { cause: parseError });
    }
    return document;
  }
}
