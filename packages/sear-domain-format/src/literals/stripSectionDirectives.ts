import { findSectionDirectives } from './findSectionDirectives';

export function stripSectionDirectives(section: string): string {
  let result = '';
  let cursor = 0;
  for (const { start, end, content } of findSectionDirectives(section)) {
    result += section.slice(cursor, start);
    if (/^[hms]+$/i.test(content)) result += section.slice(start, end);
    else result += /^\$([^\-]*)-[0-9a-f]+$/i.exec(content)?.[1] ?? '';
    cursor = end;
  }
  return result + section.slice(cursor);
}
