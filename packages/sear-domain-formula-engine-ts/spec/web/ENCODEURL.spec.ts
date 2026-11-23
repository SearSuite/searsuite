/** @jest-environment node */
import { evaluateWeb, valueError, webContext } from './WebFormulaTestHarness';

describe('ENCODEURL', () => {
  it('covers Markdown case 307: SharePoint URL with spaces', () => {
    expect(evaluateWeb('=ENCODEURL("http://contoso.sharepoint.com/Finance/Profit and Loss Statement.xlsx")')).toBe(
      'http%3A%2F%2Fcontoso.sharepoint.com%2FFinance%2FProfit%20and%20Loss%20Statement.xlsx',
    );
  });

  it.each([
    ['', ''],
    ['AZaz09-._~', 'AZaz09-._~'],
    ['a b+c', 'a%20b%2Bc'],
    ['https://example.com?q=A&B#x', 'https%3A%2F%2Fexample.com%3Fq%3DA%26B%23x'],
    ["!'()*", '%21%27%28%29%2A'],
    ['\u4e2d\u6587', '%E4%B8%AD%E6%96%87'],
    ['😀', '%F0%9F%98%80'],
    ['%20', '%2520'],
    ['a\nb\t', 'a%0Ab%09'],
  ])('encodes %j using UTF-8', (text, expected) => {
    expect(evaluateWeb('=ENCODEURL(A1)', webContext({ '0,0': text }))).toBe(expected);
  });

  it('coerces numbers, booleans, empty cells, and typed text', () => {
    expect(evaluateWeb('=ENCODEURL(123.45)')).toBe('123.45');
    expect(evaluateWeb('=ENCODEURL(-1e-12)')).toBe('-0.000000000001');
    expect(evaluateWeb('=ENCODEURL(1e-12)')).toBe('0.000000000001');
    expect(evaluateWeb('=ENCODEURL(TRUE)')).toBe('TRUE');
    expect(evaluateWeb('=ENCODEURL(A1)')).toBe('');
    expect(
      evaluateWeb('=ENCODEURL(A1)', webContext({ '0,0': { kind: 'text', value: 'A B', numericCoercion: 'deny' } })),
    ).toBe('A%20B');
  });

  it.each(['=ENCODEURL()', '=ENCODEURL(,)', '=ENCODEURL("a","b")', '=ENCODEURL({1,2})', '=ENCODEURL(A1:A2)'])(
    'rejects invalid arguments: %s',
    (formula) => {
      expect(evaluateWeb(formula)).toEqual(valueError);
    },
  );

  it('propagates errors and rejects unpaired surrogates and overlong results', () => {
    expect(evaluateWeb('=ENCODEURL(1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    for (const input of ['\ud800', '\udfff', 'x'.repeat(32_768), '中'.repeat(4_000)]) {
      expect(evaluateWeb('=ENCODEURL(A1)', webContext({ '0,0': input }))).toEqual(valueError);
    }
    expect(evaluateWeb('=ENCODEURL(A1)', webContext({ '0,0': 'x'.repeat(32_767) }))).toHaveLength(32_767);
  });
});
