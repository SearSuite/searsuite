export interface FormatSection {
  readonly raw: string;
  readonly condition?: FormatCondition;
  readonly color?: string;
  readonly fillCharacter?: string;
  readonly locale?: string;
}

export interface FormatCondition {
  readonly op: '<' | '<=' | '=' | '<>' | '>=' | '>';
  readonly value: number;
}
