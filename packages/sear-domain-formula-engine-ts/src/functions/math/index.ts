import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import * as aggregation from './aggregation';
import * as array from './array';
import * as basic from './basic';
import * as combinatorics from './combinatorics';
import * as random from './random';
import * as rounding from './rounding';
import * as statistics from './statistics';
import * as trigonometry from './trigonometry';

export * from './aggregation';
export * from './array';
export * from './basic';
export * from './combinatorics';
export * from './random';
export * from './rounding';
export * from './statistics';
export * from './trigonometry';

export const mathFunctions: readonly FormulaFunction[] = [
  ...Object.values(aggregation),
  ...Object.values(array),
  ...Object.values(basic),
  ...Object.values(combinatorics),
  ...Object.values(random),
  ...Object.values(rounding),
  ...Object.values(statistics),
  ...Object.values(trigonometry),
];
