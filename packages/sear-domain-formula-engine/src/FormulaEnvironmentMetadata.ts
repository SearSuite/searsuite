/** Optional host facts exposed without leaking platform-native APIs. */
export interface FormulaEnvironmentMetadata {
  readonly operatingSystem?: string;
  readonly version?: string;
  readonly system?: string;
  readonly calculationMode?: 'Automatic' | 'Manual';
  readonly directory?: string;
}
