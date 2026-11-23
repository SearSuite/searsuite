/** Parses common year-first calendar dates without accepting rollover dates. */
export function parseDataValidationDate(value: string): number | null {
  const western = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(value.trim());
  const chinese = /^(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5$/.exec(value.trim());
  if (!western && !chinese) return null;
  const year = Number((western ?? chinese)![1]);
  const month = Number(western?.[3] ?? chinese?.[2]);
  const day = Number(western?.[4] ?? chinese?.[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp : null;
}
