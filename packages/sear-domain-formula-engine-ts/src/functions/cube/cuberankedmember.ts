import {
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isCubeMember, readCubeQuery, readInteger, readOptionalText, readSet, readText } from './cubeFunctionHelpers';

/** Returns the member at a one-based set rank. Example: CUBERANKEDMEMBER("Sales",A1,1). */
export const CUBERANKEDMEMBER: FormulaFunction = {
  name: 'CUBERANKEDMEMBER',
  descriptor: {
    version: 1,
    summary: 'Returns the member at a rank in an OLAP set.',
    category: 'Cube',
    example: '=CUBERANKEDMEMBER("Sales",A1,1)',
    parameters: [
      { name: 'connection', description: 'Workbook cube connection.', accepts: ['text', 'cell'] },
      { name: 'set_expression', description: 'Set expression or CUBESET result.', accepts: ['text', 'cell'] },
      { name: 'rank', description: 'One-based rank.', accepts: ['number', 'cell'] },
      { name: 'caption', description: 'Optional display caption.', optional: true, accepts: ['text', 'cell'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 3 || args.length > 4) return createFormulaError(FormulaErrorCode.Value);
    const connection = readText(args[0], context);
    if (isFormulaError(connection)) return connection;
    const set = readSet(args[1], context);
    if (isFormulaError(set)) return set;
    const rank = readInteger(args[2], context);
    if (isFormulaError(rank)) return rank;
    if (rank < 1) return createFormulaError(FormulaErrorCode.Value);
    const caption = readOptionalText(args[3], context);
    if (isFormulaError(caption)) return caption;
    const result = readCubeQuery(
      { kind: 'ranked-member', connection, set, rank, ...(caption === undefined ? {} : { caption }) },
      context,
    );
    return isFormulaError(result) || isCubeMember(result) ? result : createFormulaError(FormulaErrorCode.Value);
  },
};
