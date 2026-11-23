import { findLastNumericPlaceholder } from './findLastNumericPlaceholder';

export function trailingScalingCommaCount(pattern: string): number {
  const placeholderEnd = findLastNumericPlaceholder(pattern);
  if (placeholderEnd < 0) return 0;
  const suffix = pattern.slice(placeholderEnd + 1);
  return /^,+($|[^0#?])/.exec(suffix)?.[0].replace(/[^,]/g, '').length ?? 0;
}
