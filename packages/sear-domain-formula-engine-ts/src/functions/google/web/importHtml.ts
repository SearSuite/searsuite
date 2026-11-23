import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** IMPORTHTML reads an HTML table or list from a host-managed cache. Example: =IMPORTHTML("https://example.com","table",1) returns cached rows. */
export const IMPORTHTML = createCachedGoogleFunction(
  'IMPORTHTML',
  'Returns a cached HTML table or list.',
  '=IMPORTHTML("https://example.com","table",1)',
);
