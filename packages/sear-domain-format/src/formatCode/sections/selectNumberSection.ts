import { type FormatCondition, type FormatSection } from './FormatSection';

export function selectNumberSection(value: number, sections: FormatSection[]): FormatSection | undefined {
  const conditional = sections.filter((section) => section.condition);
  if (conditional.length > 0) {
    const matched = sections.find((section) => !section.condition || conditionMatches(value, section.condition));
    if (matched) return matched;
  }
  if (sections.length === 1) return sections[0];
  if (value > 0) return sections[0];
  if (value < 0) return sections[1] ?? sections[0];
  return sections[2] ?? sections[0];
}

function conditionMatches(value: number, condition: FormatCondition): boolean {
  if (condition.op === '<') return value < condition.value;
  if (condition.op === '<=') return value <= condition.value;
  if (condition.op === '=') return value === condition.value;
  if (condition.op === '<>') return value !== condition.value;
  if (condition.op === '>=') return value >= condition.value;
  return value > condition.value;
}
