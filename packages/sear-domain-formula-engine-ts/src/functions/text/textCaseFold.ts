export interface TextMatch {
  start: number;
  end: number;
}

function foldCharacter(character: string): string {
  return character.toLocaleLowerCase().replace(/ß/g, 'ss');
}

export function foldCase(text: string): { text: string; starts: number[]; ends: number[] } {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let offset = 0; offset < text.length; ) {
    const character = String.fromCodePoint(text.codePointAt(offset)!);
    const part = foldCharacter(character);
    folded += part;
    for (let index = 0; index < part.length; index++) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }
  return { text: folded, starts, ends };
}

export function findCaseInsensitive(text: string, needle: string, from = 0): TextMatch | undefined {
  if (needle === '') return { start: from, end: from };
  const folded = foldCase(text);
  const target = foldCase(needle).text;
  for (let index = folded.text.indexOf(target); index >= 0; index = folded.text.indexOf(target, index + 1)) {
    const endIndex = index + target.length - 1;
    if (
      folded.starts[index]! < from ||
      (index > 0 && folded.starts[index] === folded.starts[index - 1]) ||
      (endIndex + 1 < folded.starts.length && folded.starts[endIndex] === folded.starts[endIndex + 1])
    )
      continue;
    return { start: folded.starts[index]!, end: folded.ends[endIndex]! };
  }
  return undefined;
}
