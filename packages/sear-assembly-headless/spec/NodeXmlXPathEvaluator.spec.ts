/** @jest-environment node */

import { XmlXPathError, XmlXPathErrorCode } from '@searsuite/sear-foundation-platform';
import { NodeXmlXPathEvaluator } from '../src';

describe('NodeXmlXPathEvaluator', () => {
  it('matches the browser adapter for element and attribute selections', () => {
    const evaluator = new NodeXmlXPathEvaluator();
    const xml = '<root><item title="one">First</item><item title="two">Second</item></root>';

    expect(evaluator.evaluate(xml, '//item').values).toEqual(['First', 'Second']);
    expect(evaluator.evaluate(xml, '//item/@title').values).toEqual(['one', 'two']);
    expect(evaluator.evaluate(xml, 'count(//item)').values).toEqual(['2']);
    expect(evaluator.evaluate('<root/>', '//missing').values).toEqual([]);
    expect(evaluator.evaluate('<root/>', 'boolean(//missing)').values).toEqual(['false']);
    expect(
      evaluator.evaluate('<root xmlns:p="urn:test"><p:item>value</p:item></root>', '//p:item', {
        namespaces: { p: 'urn:test' },
      }).values,
    ).toEqual(['value']);
  });

  it('reports malformed XML through the shared error contract', () => {
    expect(() => new NodeXmlXPathEvaluator().evaluate('<root>', '//root')).toThrow(XmlXPathError);
    expect(() => new NodeXmlXPathEvaluator().evaluate('<root/>', '//*[')).toThrow(
      expect.objectContaining({ code: XmlXPathErrorCode.InvalidXPath }),
    );
    expect(() => new NodeXmlXPathEvaluator().evaluate('', '//root')).toThrow(XmlXPathError);
    expect(() => new NodeXmlXPathEvaluator().evaluate('<!DOCTYPE root><root/>', '//root')).toThrow(XmlXPathError);
  });
});
