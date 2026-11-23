export function looksLikeDateTimeFormat(pattern: string): boolean {
  const normalized = pattern.replace(/"[^"]*"/g, '').replace(/\\./g, '');
  return (
    /b/i.test(normalized) ||
    /\[[hms]\]/i.test(normalized) ||
    /\b(?:am\/pm|a\/p)\b/i.test(normalized) ||
    (/(^|[^a-zA-Z])[ymdhs]+([^a-zA-Z]|$)/i.test(normalized) &&
      (/[ydhs]/i.test(normalized) || (/m/i.test(normalized) && !/[0#?]/.test(normalized))))
  );
}
