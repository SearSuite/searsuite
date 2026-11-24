import { Injectable } from '@searsuite/sear-foundation-di';
import {
  XmlXPathEngine,
  XmlXPathError,
  XmlXPathErrorCode,
  type XmlXPathEvaluation,
  type XmlXPathOptions,
} from '@searsuite/sear-foundation-platform';
import * as xpathEngine from 'xpath';

/** Node XPath engine backed by the xpath package. */
@Injectable()
export class NodeXmlXPathEngine extends XmlXPathEngine {
  public static readonly symbol: symbol = Symbol.for('NodeXmlXPathEngine');

  public evaluate(document: unknown, xpath: string, options: XmlXPathOptions): XmlXPathEvaluation {
    let selected: unknown;
    try {
      selected = options.namespaces
        ? xpathEngine.useNamespaces({ ...options.namespaces })(xpath, document as Node)
        : xpathEngine.select(xpath, document as Node);
    } catch (error) {
      throw new XmlXPathError(XmlXPathErrorCode.InvalidXPath, 'XPath expression could not be evaluated.', {
        xpath,
        cause: error,
      });
    }

    if (Array.isArray(selected)) {
      return {
        values: selected.map((node) => {
          if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return String(node);
          const candidate = node as {
            nodeType?: number;
            nodeValue?: string | null;
            textContent?: string | null;
            documentElement?: { textContent: string | null };
          };
          if (candidate.nodeType === 2) return candidate.nodeValue ?? '';
          return (candidate.nodeType === 9 ? candidate.documentElement?.textContent : candidate.textContent) ?? '';
        }),
      };
    }
    if (typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean') {
      return { values: [String(selected)] };
    }
    throw new XmlXPathError(XmlXPathErrorCode.UnsupportedResult, 'XPath returned an unsupported result type.', {
      xpath,
    });
  }
}
