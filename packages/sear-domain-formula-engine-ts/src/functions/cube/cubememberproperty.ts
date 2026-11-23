import {
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { readCubeQuery, readMemberExpression, readText } from './cubeFunctionHelpers';

/** Returns one property of a cube member. Example: CUBEMEMBERPROPERTY("Sales","[Time].[2004]","Name"). */
export const CUBEMEMBERPROPERTY: FormulaFunction = {
  name: 'CUBEMEMBERPROPERTY',
  descriptor: {
    version: 1,
    summary: 'Returns a property of an OLAP cube member.',
    category: 'Cube',
    example: '=CUBEMEMBERPROPERTY("Sales","[Time].[Fiscal].[2014]","Name")',
    parameters: [
      { name: 'connection', description: 'Workbook cube connection.', accepts: ['text', 'cell'] },
      { name: 'member_expression', description: 'Member expression.', accepts: ['text', 'cell'] },
      { name: 'property', description: 'Member property.', accepts: ['text', 'cell'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length !== 3) return createFormulaError(FormulaErrorCode.Value);
    const connection = readText(args[0], context);
    if (isFormulaError(connection)) return connection;
    const member = readMemberExpression(args[1], context);
    if (isFormulaError(member)) return member;
    const property = readText(args[2], context);
    if (isFormulaError(property)) return property;
    return readCubeQuery({ kind: 'member-property', connection, member, property }, context);
  },
};
