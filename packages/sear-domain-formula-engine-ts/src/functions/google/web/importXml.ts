import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** IMPORTXML reads XPath-selected data from a host-managed cache. Example: =IMPORTXML("https://example.com","//title") returns cached nodes. */
export const IMPORTXML = createCachedGoogleFunction(
  'IMPORTXML',
  'Returns cached XPath-selected web data.',
  '=IMPORTXML("https://example.com","//title")',
);
