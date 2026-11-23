export function countPlaceholders(value: string): number {
  return (value.match(/[0#?]/g) ?? []).length;
}
