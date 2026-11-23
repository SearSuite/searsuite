export function createRegex(pattern: string, caseSensitivity: number, global = false): RegExp | undefined {
  if (caseSensitivity !== 0 && caseSensitivity !== 1) return undefined;
  try {
    const source = pattern.includes('(?>') ? translateAtomicGroups(pattern) : pattern;
    if (source === undefined) return undefined;
    return new RegExp(source, `${global ? 'g' : ''}${caseSensitivity === 1 ? 'i' : ''}u`);
  } catch {
    return undefined;
  }
}

function translateAtomicGroups(pattern: string, names = { next: 0 }): string | undefined {
  if (/\\[1-9]/.test(pattern)) return undefined;
  let result = '';
  for (let index = 0; index < pattern.length; ) {
    if (pattern[index] === '\\') {
      result += pattern.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (pattern[index] === '[') {
      const start = index++;
      while (index < pattern.length && pattern[index] !== ']') index += pattern[index] === '\\' ? 2 : 1;
      result += pattern.slice(start, Math.min(pattern.length, ++index));
      continue;
    }
    if (!pattern.startsWith('(?>', index)) {
      result += pattern[index++];
      continue;
    }
    const start = index + 3;
    let depth = 1;
    index = start;
    while (index < pattern.length && depth > 0) {
      if (pattern[index] === '\\') {
        index += 2;
        continue;
      }
      if (pattern[index] === '[') {
        index++;
        while (index < pattern.length && pattern[index] !== ']') index += pattern[index] === '\\' ? 2 : 1;
        index++;
        continue;
      }
      if (pattern[index] === '(') depth++;
      if (pattern[index] === ')') depth--;
      index++;
    }
    if (depth !== 0) return undefined;
    const inner = translateAtomicGroups(pattern.slice(start, index - 1), names);
    if (inner === undefined) return undefined;
    const name = `searAtomic${names.next++}`;
    result += `(?=(?<${name}>${inner}))\\k<${name}>`;
  }
  return result;
}
