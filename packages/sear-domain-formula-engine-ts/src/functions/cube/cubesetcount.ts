import {
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isCubeSet, readCubeQuery, readValue } from './cubeFunctionHelpers';

/** Returns the item count of a CUBESET result. Example: CUBESETCOUNT(A1). */
export const CUBESETCOUNT: FormulaFunction = {
  name: 'CUBESETCOUNT',
  descriptor: {
    version: 1,
    summary: 'Returns the number of items in an OLAP set.',
    category: 'Cube',
    example: '=CUBESETCOUNT(A1)',
    parameters: [{ name: 'set', description: 'CUBESET result.', accepts: ['cell'] }],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length !== 1) return createFormulaError(FormulaErrorCode.Value);
    const set = readValue(args[0], context);
    if (isFormulaError(set)) return set;
    if (!isCubeSet(set)) return createFormulaError(FormulaErrorCode.Value);
    if (set.count !== undefined) return set.count;
    const result = readCubeQuery({ kind: 'set-count', set }, context);
    return typeof result === 'number' || isFormulaError(result) ? result : createFormulaError(FormulaErrorCode.Value);
  },
};
