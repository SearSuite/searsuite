import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** IMPORTFEED reads RSS or Atom data from a host-managed cache. Example: =IMPORTFEED("https://example.com/feed.xml") returns cached feed rows. */
export const IMPORTFEED = createCachedGoogleFunction(
  'IMPORTFEED',
  'Returns cached feed data.',
  '=IMPORTFEED("https://example.com/feed.xml")',
);
