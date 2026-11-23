import { findNumericPlaceholder } from './findNumericPlaceholder';

export function findFirstNumericPlaceholder(pattern: string): number {
  return findNumericPlaceholder(pattern, false);
}
