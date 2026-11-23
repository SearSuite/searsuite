import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** IMPORTDATA reads CSV or TSV data from a host-managed cache. Example: =IMPORTDATA("https://example.com/data.csv") returns cached rows. */
export const IMPORTDATA = createCachedGoogleFunction(
  'IMPORTDATA',
  'Returns cached delimited web data.',
  '=IMPORTDATA("https://example.com/data.csv")',
);
