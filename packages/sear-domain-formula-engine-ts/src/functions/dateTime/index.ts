import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import * as business from './business';
import * as construction from './construction';
import * as conversion from './conversion';
import * as difference from './difference';
import * as extraction from './extraction';
import * as volatile from './volatile';

export * from './business';
export * from './construction';
export * from './conversion';
export * from './difference';
export * from './extraction';
export * from './shared/dateTimeUtils';
export * from './shared/excelDateTimeSymbols';
export * from './volatile';

export const dateTimeFunctions: readonly FormulaFunction[] = [
  ...Object.values(construction),
  ...Object.values(conversion),
  ...Object.values(difference),
  ...Object.values(extraction),
  ...Object.values(business),
  ...Object.values(volatile),
];
