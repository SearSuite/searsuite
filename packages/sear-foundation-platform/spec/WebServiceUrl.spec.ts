import { isHttpWebServiceUrl } from '../src';

describe('web-service URL syntax', () => {
  it.each([
    'http://example.com',
    'https://example.com/path?q=A%26B#fragment',
    'HTTPS://example.com',
    'http://localhost:8080',
    'http://[::1]:8080/data',
  ])('accepts %s without imposing host address policy', (url) => {
    expect(isHttpWebServiceUrl(url)).toBe(true);
  });
  it.each([
    '',
    'file:///tmp/xml',
    'ftp://example.com',
    'https://',
    'https:///path',
    'https://example.com:bad',
    'https://example.com:99999',
    'https://[bad]/',
    'https://a b',
    ' https://example.com',
    'https://example.com\n',
    'https://example.com\u0000',
  ])('rejects malformed %j', (url) => {
    expect(isHttpWebServiceUrl(url)).toBe(false);
  });
});
