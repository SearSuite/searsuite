const characters = [
  ...'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ',
];
const codes = new Map(characters.map((character, index) => [character, index + 128]));

export function macRomanCharacter(code: number): string | undefined {
  return code >= 128 && code <= 255 ? characters[code - 128] : undefined;
}

export function macRomanCode(character: string): number | undefined {
  return codes.get(character);
}
