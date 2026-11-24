import { FunctionRegistry } from '@searsuite/sear-domain-formula-engine-ts';

// Optional dialect and host-specific functions are registered by hosts that support them.
const unavailableBuiltinNames = [
  'AVERAGE_WEIGHTED',
  'MARGINOFERROR',
  'EUROCONVERT',
  'VALUETOTEXT',
  'ISBETWEEN',
  'ISDATE',
  'ISEMAIL',
  'ISURL',
  'REGEXEXTRACT',
  'REGEXMATCH',
  'REGEXREPLACE',
  'REGEXTEST',
  'JIS',
  'TO_DATE',
  'FILTERXML',
  'EPOCHTODATE',
] as const;

/** Creates the default HeadlessEditor function catalog. */
export function createHeadlessFunctionRegistry(): FunctionRegistry {
  return new FunctionRegistry({
    includeGoogleFunctions: false,
    excludedBuiltinNames: unavailableBuiltinNames,
  });
}
