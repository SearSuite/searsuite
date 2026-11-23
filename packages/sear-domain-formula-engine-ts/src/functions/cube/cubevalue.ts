import {
  isFormulaArgumentKind,
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaCubeMemberExpression,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { readCubeQuery, readMemberExpression, readText } from './cubeFunctionHelpers';

/** Returns an aggregated cube value. Example: CUBEVALUE("Sales","[Measures].[Profit]"). */
export const CUBEVALUE: FormulaFunction = {
  name: 'CUBEVALUE',
  descriptor: {
    version: 1,
    summary: 'Returns an aggregated value from an OLAP cube.',
    category: 'Cube',
    example: '=CUBEVALUE("Sales","[Measures].[Profit]")',
    parameters: [
      { name: 'connection', description: 'Workbook cube connection.', accepts: ['text', 'cell'] },
      {
        name: 'member_expression',
        description: 'Member or tuple expression.',
        optional: true,
        repeating: true,
        accepts: ['text', 'cell', 'range'],
      },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 1) return createFormulaError(FormulaErrorCode.Value);
    const connection = readText(args[0], context);
    if (isFormulaError(connection)) return connection;
    const members: FormulaCubeMemberExpression[] = [];
    for (const arg of args.slice(1)) {
      if (isFormulaArgumentKind(arg, 'missing')) continue;
      const member = readMemberExpression(arg, context);
      if (isFormulaError(member)) return member;
      members.push(member);
    }
    return readCubeQuery({ kind: 'value', connection, members }, context);
  },
};
