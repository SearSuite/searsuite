/** @jest-environment node */
import { evaluateWeb, valueError, webContext } from './WebFormulaTestHarness';

const recentChanges =
  '<api><query><recentchanges>' +
  '<rc title="Excel" timestamp="2024-01-01T00:00:00Z"/>' +
  '<rc title="Spreadsheet" timestamp="2024-01-01T01:00:00Z"/>' +
  '<rc title="XML" timestamp="2024-01-01T02:00:00Z"/>' +
  '</recentchanges></query></api>';

describe('FILTERXML', () => {
  it('covers Markdown cases 358 and 359 with B3 XML data', () => {
    const context = webContext({ '2,1': recentChanges });
    expect(evaluateWeb('=FILTERXML(B3,"//rc/@title")', context)).toEqual([['Excel'], ['Spreadsheet'], ['XML']]);
    expect(evaluateWeb('=FILTERXML(B3,"//rc/@timestamp")', context)).toEqual([
      ['2024-01-01T00:00:00Z'],
      ['2024-01-01T01:00:00Z'],
      ['2024-01-01T02:00:00Z'],
    ]);
  });

  it.each([
    ['//item', [['A&B'], ['\u4e2d\u6587'], ['']]],
    ['//item/@id', [['1'], ['2'], ['3']]],
    ['//item[2]', [['\u4e2d\u6587']]],
    ['//item[@id="1"]/text()', [['A&B']]],
    ['//item[position()<=2]', [['A&B'], ['\u4e2d\u6587']]],
    ['count(//item)', [['3']]],
    ['string(//item[1])', [['A&B']]],
    ['boolean(//item)', [['true']]],
  ])('supports XPath %s', (xpath, expected) => {
    const xml = '<root><item id="1">A&amp;B</item><item id="2"><![CDATA[中文]]></item><item id="3"/></root>';
    expect(evaluateWeb('=FILTERXML(A1,B1)', webContext({ '0,0': xml, '0,1': xpath }))).toEqual(expected);
  });

  it('preserves XPath text including numeric-looking values', () => {
    const xml =
      '<r><v>12.5</v><v>-2</v><v>1e3</v><v> 0 </v><v>1,234</v><v>TRUE</v><v>0x10</v><v> </v><v>1e999</v><v>A<b>B</b>C</v></r>';
    expect(evaluateWeb('=FILTERXML(A1,"//v")', webContext({ '0,0': xml }))).toEqual([
      ['12.5'],
      ['-2'],
      ['1e3'],
      [' 0 '],
      ['1,234'],
      ['TRUE'],
      ['0x10'],
      [' '],
      ['1e999'],
      ['ABC'],
    ]);
    expect(evaluateWeb('=FILTERXML("<r><v>001</v></r>","//v")')).toEqual([['001']]);
    expect(evaluateWeb('=ISNUMBER(INDEX(FILTERXML("<r><v>001</v></r>","//v"),1,1))')).toBe(false);
    expect(evaluateWeb('=SUM(FILTERXML("<r><v>001</v></r>","//v"))')).toBe(0);
  });

  it('queries namespaced XML with standard local-name XPath expressions', () => {
    expect(
      evaluateWeb(
        '=FILTERXML(A1,B1)',
        webContext({
          '0,0': '<r xmlns="urn:sample"><v>value</v></r>',
          '0,1': '//*[local-name()="v"]',
        }),
      ),
    ).toEqual([['value']]);
  });

  it.each([
    ['', '//v'],
    ['<r>', '//r'],
    ['<r/>', '//*['],
    ['<r/>', ''],
    ['<r/>', '//missing'],
    ['<!DOCTYPE r [<!ENTITY x "value">]><r>&x;</r>', '//r'],
    ['<r>&unknown;</r>', '//r'],
    ['<r/>', '//unknown:v'],
    ['<r/>', '   '],
  ])('maps invalid XML/XPath and empty matches to #VALUE!', (xml, xpath) => {
    expect(evaluateWeb('=FILTERXML(A1,B1)', webContext({ '0,0': xml, '0,1': xpath }))).toEqual(valueError);
  });

  it.each(['=FILTERXML()', '=FILTERXML("<r/>")', '=FILTERXML("<r/>","//r",1)', '=FILTERXML({1,2},"//r")'])(
    'rejects invalid arguments: %s',
    (formula) => {
      expect(evaluateWeb(formula)).toEqual(valueError);
    },
  );

  it('propagates argument errors and handles missing adapters and text length limits', () => {
    expect(evaluateWeb('=FILTERXML(1/0,"//r")')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluateWeb('=FILTERXML("<r/>",1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    const context = webContext();
    delete context.xmlXPath;
    expect(evaluateWeb('=FILTERXML("<r/>","//r")', context)).toEqual(valueError);
    expect(evaluateWeb('=FILTERXML(A1,"//r")', webContext({ '0,0': `<r>${'x'.repeat(32_761)}</r>` }))).toEqual(
      valueError,
    );
    expect(evaluateWeb('=FILTERXML(A1,"//r")', webContext({ '0,0': `<r>${'x'.repeat(32_760)}</r>` }))).toEqual([
      ['x'.repeat(32_760)],
    ]);
  });
});
