import { findNumericPlaceholder } from './findNumericPlaceholder';

export function findLastNumericPlaceholder(pattern: string): number {
  return findNumericPlaceholder(pattern, true);
}
