let reversePage: Map<string, number> | undefined;

export function gbkCharacterCode(character: string): number {
  if (!reversePage) reversePage = createReversePage();
  return reversePage.get(character) ?? 95;
}

function createReversePage(): Map<string, number> {
  const codes = new Map<string, number>();
  if (typeof TextDecoder === 'undefined') return codes;
  const decoder = new TextDecoder('gbk', { fatal: true });
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue;
      try {
        const character = decoder.decode(Uint8Array.of(lead, trail));
        if ([...character].length === 1 && !codes.has(character)) codes.set(character, (lead << 8) | trail);
      } catch {
        // Invalid byte pairs have no character mapping.
      }
    }
  }
  return codes;
}
