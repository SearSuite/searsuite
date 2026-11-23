/** @jest-environment node */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FunctionRegistry } from '../src/functions';
import { dateTimeBenchmarkNames } from '../benchmark/dateTimeBenchmarkNames';
import { mathBenchmarkNames } from '../benchmark/mathBenchmarkNames';
import { textBenchmarkNames } from '../benchmark/textBenchmarkNames';
import { statisticsBenchmarkCases } from '../benchmark/statisticsBenchmarkCases';
import { financialBenchmarkCases } from '../benchmark/financialBenchmarkCases';
import { lookupFunctionNames } from '../src/functions/lookup/lookupFunctionNames';
import { cubeBenchmarkNames } from '../benchmark/cubeBenchmarkNames';
import { addInBenchmarkNames } from '../benchmark/addInBenchmarkNames';
import { compatibilityBenchmarkNames } from '../benchmark/compatibilityBenchmarkNames';
import { databaseBenchmarkNames } from '../benchmark/databaseBenchmarkNames';
import { informationBenchmarkNames } from '../benchmark/informationBenchmarkNames';
import { logicalBenchmarkNames } from '../benchmark/logicalBenchmarkNames';
import { dialectBenchmarkNames } from '../benchmark/dialectBenchmarkNames';
import { googleBenchmarkNames } from '../benchmark/googleBenchmarkNames';

describe('built-in function benchmark coverage', () => {
  it('has a threshold benchmark spec for every registered built-in function', () => {
    const benchmarkedFunctions = readdirSync(join(__dirname, '../benchmark'))
      .map((fileName) => /^([A-Z][A-Z0-9_]*)\.benchmark\.spec\.ts$/.exec(fileName)?.[1])
      .filter((name): name is string => name !== void 0)
      .sort();

      expect([...new Set([...benchmarkedFunctions, ...addInBenchmarkNames, ...compatibilityBenchmarkNames, ...databaseBenchmarkNames, ...informationBenchmarkNames, ...logicalBenchmarkNames, ...dialectBenchmarkNames, ...googleBenchmarkNames, ...lookupFunctionNames, ...cubeBenchmarkNames, ...dateTimeBenchmarkNames, ...mathBenchmarkNames, ...textBenchmarkNames, ...statisticsBenchmarkCases.map(([name]) => name), ...financialBenchmarkCases.map(([name]) => name)])].sort()).toEqual(
      new FunctionRegistry().list().sort(),
    );
  });
});
