/** @jest-environment node */
import { FormulaWebServiceDefinition, FormulaWebLimits } from '@searsuite/sear-domain-formula-engine';
import { FormulaExternalServiceRegistry, FormulaWebServiceCache } from '../../src';
import { evaluateWeb, unavailableError, valueError, webContext } from './WebFormulaTestHarness';

describe('WEBSERVICE', () => {
  it('covers Markdown case 1121 with a deterministic host-loaded service', async () => {
    const url = 'http://mywebservice.com/serviceEndpoint?searchString=Excel';
    const loader = jest.fn(async () => '<result>Excel</result>');
    const cache = new FormulaWebServiceCache(loader);
    const services = new FormulaExternalServiceRegistry();
    services.register(FormulaWebServiceDefinition, cache);
    const context = webContext({}, { externalServices: services });
    const formula = `=WEBSERVICE("${url}")`;
    expect(evaluateWeb(formula, context)).toEqual(unavailableError);
    expect(loader).not.toHaveBeenCalled();
    const request = cache.load(url);
    expect(evaluateWeb(formula, context)).toEqual(unavailableError);
    await request;
    expect(evaluateWeb(formula, context)).toBe('<result>Excel</result>');
    expect(loader).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 100; index++) expect(evaluateWeb(formula, context)).toBe('<result>Excel</result>');
    expect(loader).toHaveBeenCalledTimes(1);
    services.destroy();
    cache.destroy();
  });

  it('composes the documented URL encoding, web request, and stock-price XPath', async () => {
    const url = 'http://dev.markitondemand.com/MODApis/Api/Quote/xml?symbol=A%26B';
    const cache = new FormulaWebServiceCache(
      async () => '<QuoteApiModel><Data><LastPrice>123.45</LastPrice></Data></QuoteApiModel>',
    );
    const services = new FormulaExternalServiceRegistry();
    services.register(FormulaWebServiceDefinition, cache);
    await cache.load(url);
    expect(
      evaluateWeb(
        '=FILTERXML(WEBSERVICE("http://dev.markitondemand.com/MODApis/Api/Quote/xml?symbol="&ENCODEURL(C2)),"//QuoteApiModel/Data/LastPrice")',
        webContext({ '1,2': 'A&B' }, { externalServices: services }),
      ),
    ).toEqual([['123.45']]);
    services.destroy();
    cache.destroy();
  });

  it.each([
    '=WEBSERVICE()',
    '=WEBSERVICE("https://a",1)',
    '=WEBSERVICE({1,2})',
    '=WEBSERVICE(123)',
    '=WEBSERVICE("")',
    '=WEBSERVICE("ftp://example.com")',
    '=WEBSERVICE("file:///tmp/data")',
    '=WEBSERVICE("https://")',
    '=WEBSERVICE("https://a b")',
  ])('rejects invalid input: %s', (formula) => {
    expect(evaluateWeb(formula)).toEqual(valueError);
  });

  it('validates URL limits, propagates errors, and reports missing service data', () => {
    const prefix = 'https://example.com/';
    const url = prefix + 'x'.repeat(FormulaWebLimits.urlLength - prefix.length);
    expect(evaluateWeb('=WEBSERVICE(A1)', webContext({ '0,0': url }))).toEqual(unavailableError);
    expect(evaluateWeb('=WEBSERVICE(A1)', webContext({ '0,0': url + 'x' }))).toEqual(valueError);
    expect(evaluateWeb('=WEBSERVICE(1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluateWeb('=WEBSERVICE("https://example.com/data")')).toEqual(unavailableError);
  });

  it.each([
    ['empty', ''],
    ['Unicode', '中文 😀'],
    ['at limit', 'x'.repeat(32_767)],
    ['over limit', 'x'.repeat(32_768)],
  ])('enforces response text limits (%s)', async (_name, text) => {
    const services = new FormulaExternalServiceRegistry();
    const cache = new FormulaWebServiceCache(async () => text);
    services.register(FormulaWebServiceDefinition, cache);
    await cache.load('https://example.com');
    expect(evaluateWeb('=WEBSERVICE("https://example.com")', webContext({}, { externalServices: services }))).toEqual(
      text.length > 32_767 ? valueError : text,
    );
    services.destroy();
    cache.destroy();
  });

  it('also validates response limits on custom cache services', () => {
    const services = new FormulaExternalServiceRegistry();
    services.register(FormulaWebServiceDefinition, {
      read: () => ({ status: 'ready', value: 'x'.repeat(32_768) }),
      subscribeInvalidation: () => () => void 0,
    });
    expect(evaluateWeb('=WEBSERVICE("https://example.com")', webContext({}, { externalServices: services }))).toEqual(
      valueError,
    );
    services.destroy();
  });
});
