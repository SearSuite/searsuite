import {
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isCubeMember, readCubeQuery, readMemberExpression, readOptionalText, readText } from './cubeFunctionHelpers';

/** Returns a typed cube member or tuple. Example: CUBEMEMBER("Sales","[Time].[Fiscal].[2004]"). */
export const CUBEMEMBER: FormulaFunction = {
  name: 'CUBEMEMBER',
  descriptor: {
    version: 1,
    summary: 'Returns a member or tuple from an OLAP cube.',
    category: 'Cube',
    example: '=CUBEMEMBER("Sales","[Time].[Fiscal].[2004]")',
    parameters: [
      { name: 'connection', description: 'Workbook cube connection.', accepts: ['text', 'cell'] },
      { name: 'member_expression', description: 'MDX member or tuple expression.', accepts: ['text', 'cell', 'range'] },
      { name: 'caption', description: 'Optional display caption.', optional: true, accepts: ['text', 'cell'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return createFormulaError(FormulaErrorCode.Value);
    const connection = readText(args[0], context);
    if (isFormulaError(connection)) return connection;
    const expression = readMemberExpression(args[1], context);
    if (isFormulaError(expression)) return expression;
    const caption = readOptionalText(args[2], context);
    if (isFormulaError(caption)) return caption;
    const result = readCubeQuery(
      { kind: 'member', connection, expression, ...(caption === undefined ? {} : { caption }) },
      context,
    );
    return isFormulaError(result) || isCubeMember(result) ? result : createFormulaError(FormulaErrorCode.Value);
  },
};
