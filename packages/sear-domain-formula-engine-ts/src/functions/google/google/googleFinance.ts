import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** GOOGLEFINANCE reads market data from a host-managed cache. Example: =GOOGLEFINANCE("NASDAQ:GOOG","price") returns cached price data. */
export const GOOGLEFINANCE = createCachedGoogleFunction(
  'GOOGLEFINANCE',
  'Returns cached market data.',
  '=GOOGLEFINANCE("NASDAQ:GOOG","price")',
);
