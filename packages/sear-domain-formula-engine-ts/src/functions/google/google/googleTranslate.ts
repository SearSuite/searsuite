import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** GOOGLETRANSLATE reads a translation from a host-managed cache. Example: =GOOGLETRANSLATE("hello","en","zh-CN") returns cached text. */
export const GOOGLETRANSLATE = createCachedGoogleFunction(
  'GOOGLETRANSLATE',
  'Returns a cached translation.',
  '=GOOGLETRANSLATE("hello","en","zh-CN")',
);
