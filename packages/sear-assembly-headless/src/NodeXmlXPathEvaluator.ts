import { Injectable } from '@searsuite/sear-foundation-di';
import { XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { NodeXmlDocumentParser } from './NodeXmlDocumentParser';
import { NodeXmlXPathEngine } from './NodeXmlXPathEngine';

/** Node XML/XPath evaluator for standalone use. */
@Injectable()
export class NodeXmlXPathEvaluator extends XmlXPathEvaluator {
  public static readonly symbol: symbol = Symbol.for('NodeXmlXPathEvaluator');

  public constructor() {
    super(new NodeXmlDocumentParser(), new NodeXmlXPathEngine());
  }
}
