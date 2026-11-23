import { Container, Injectable } from '@searsuite/sear-foundation-di';
import {
  XmlDocumentParser,
  XmlXPathEngine,
  XmlXPathEvaluator,
  type XmlXPathEvaluation,
  type XmlXPathOptions,
} from '@searsuite/sear-foundation-platform';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { registerEditorBaseServices } from '../src/sheet/registerEditorBaseServices';

@Injectable()
class TestXmlDocumentParser extends XmlDocumentParser {
  public parse(xml: string): unknown {
    return { xml };
  }
}

@Injectable()
class TestXmlXPathEngine extends XmlXPathEngine {
  public evaluate(document: unknown, xpath: string, options: XmlXPathOptions): XmlXPathEvaluation {
    return { values: [JSON.stringify({ document, xpath, options })] };
  }
}

describe('XML/XPath service registration', () => {
  it('composes the host-provided parser and XPath engine through DI', () => {
    const container = new Container();
    registerEditorBaseServices(
      container,
      {
        platform: HeadlessPlatform,
        xmlDocumentParser: TestXmlDocumentParser,
        xmlXPathEngine: TestXmlXPathEngine,
      },
      { width: 800, height: 600 },
    );

    expect(container.resolve(XmlDocumentParser.symbol)).toBeInstanceOf(TestXmlDocumentParser);
    expect(container.resolve(XmlXPathEngine.symbol)).toBeInstanceOf(TestXmlXPathEngine);
    const evaluator = container.resolve<XmlXPathEvaluator>(XmlXPathEvaluator.symbol);
    expect(evaluator.evaluate('<root/>', '//root', { namespaces: { p: 'urn:test' } }).values).toEqual([
      JSON.stringify({ document: { xml: '<root/>' }, xpath: '//root', options: { namespaces: { p: 'urn:test' } } }),
    ]);
    container.reset();
  });
});
