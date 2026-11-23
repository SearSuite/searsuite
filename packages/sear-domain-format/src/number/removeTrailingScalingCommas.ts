import { findLastNumericPlaceholder } from './findLastNumericPlaceholder';

export function removeTrailingScalingCommas(pattern: string): string {
  const placeholderEnd = findLastNumericPlaceholder(pattern);
  if (placeholderEnd < 0) return pattern;
  let index = placeholderEnd + 1;
  while (pattern[index] === ',') index++;
  return pattern.slice(0, placeholderEnd + 1) + pattern.slice(index);
}
