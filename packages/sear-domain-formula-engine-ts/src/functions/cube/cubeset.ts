import {
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isCubeSet, readCubeQuery, readInteger, readOptionalText, readText } from './cubeFunctionHelpers';

/** Returns a typed OLAP set. Example: CUBESET("Sales","[Product].Members","Products"). */
export const CUBESET: FormulaFunction = {
  name: 'CUBESET',
  descriptor: {
    version: 1,
    summary: 'Creates a calculated set in an OLAP cube.',
    category: 'Cube',
    example: '=CUBESET("Sales","[Product].[All Products].Children","Products")',
    parameters: [
      { name: 'connection', description: 'Workbook cube connection.', accepts: ['text', 'cell'] },
      { name: 'set_expression', description: 'MDX set expression.', accepts: ['text', 'cell'] },
      { name: 'caption', description: 'Optional display caption.', optional: true, accepts: ['text', 'cell'] },
      {
        name: 'sort_order',
        description: 'Set sort order from 0 through 6.',
        optional: true,
        accepts: ['number', 'cell'],
      },
      { name: 'sort_by', description: 'Optional sort expression.', optional: true, accepts: ['text', 'cell'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 2 || args.length > 5) return createFormulaError(FormulaErrorCode.Value);
    const connection = readText(args[0], context);
    if (isFormulaError(connection)) return connection;
    const expression = readText(args[1], context);
    if (isFormulaError(expression)) return expression;
    const caption = readOptionalText(args[2], context);
    if (isFormulaError(caption)) return caption;
    const sortOrder = args[3] && args[3].kind !== 'missing' ? readInteger(args[3], context) : undefined;
    if (isFormulaError(sortOrder)) return sortOrder;
    if (sortOrder !== undefined && (sortOrder < 0 || sortOrder > 6)) return createFormulaError(FormulaErrorCode.Value);
    const sortBy = readOptionalText(args[4], context);
    if (isFormulaError(sortBy)) return sortBy;
    if ((sortOrder === 1 || sortOrder === 2) && sortBy === undefined) return createFormulaError(FormulaErrorCode.Value);
    const result = readCubeQuery(
      {
        kind: 'set',
        connection,
        expression,
        ...(caption === undefined ? {} : { caption }),
        ...(sortOrder === undefined ? {} : { sortOrder }),
        ...(sortBy === undefined ? {} : { sortBy }),
      },
      context,
    );
    return isFormulaError(result) || isCubeSet(result) ? result : createFormulaError(FormulaErrorCode.Value);
  },
};
