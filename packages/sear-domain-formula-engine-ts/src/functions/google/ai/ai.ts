import { createCachedGoogleFunction } from '../runtime/googleRuntime';
/** AI reads a Gemini result from a host-managed cache. Example: =AI("Summarize",A1) returns cached generated text. */
export const AI = createCachedGoogleFunction(
  'AI',
  'Returns an AI result from a host-managed cache.',
  '=AI("Summarize",A1)',
);
