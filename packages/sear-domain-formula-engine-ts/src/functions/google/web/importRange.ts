import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** IMPORTRANGE reads another spreadsheet through a host-managed cache. Example: =IMPORTRANGE("sheet-id","A1:B2") returns cached cells. */
export const IMPORTRANGE = createCachedGoogleFunction(
  'IMPORTRANGE',
  'Returns a cached external spreadsheet range.',
  '=IMPORTRANGE("sheet-id","A1:B2")',
);
