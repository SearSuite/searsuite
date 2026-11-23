import {
  FormulaCubeKpiProperty,
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isCubeMember, readCubeQuery, readInteger, readOptionalText, readText } from './cubeFunctionHelpers';

/** Returns a typed KPI property member. Example: CUBEKPIMEMBER("Sales","Revenue KPI",KPIGoal). */
export const CUBEKPIMEMBER: FormulaFunction = {
  name: 'CUBEKPIMEMBER',
  namedConstants: FormulaCubeKpiProperty,
  descriptor: {
    version: 1,
    summary: 'Returns a KPI property member from an OLAP cube.',
    category: 'Cube',
    example: '=CUBEKPIMEMBER("Sales","MySalesKPI",KPIGoal)',
    parameters: [
      { name: 'connection', description: 'Workbook cube connection.', accepts: ['text', 'cell'] },
      { name: 'kpi_name', description: 'KPI name.', accepts: ['text', 'cell'] },
      { name: 'kpi_property', description: 'KPI property number or constant.', accepts: ['number', 'cell'] },
      { name: 'caption', description: 'Optional display caption.', optional: true, accepts: ['text', 'cell'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaCubeServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 3 || args.length > 4) return createFormulaError(FormulaErrorCode.Value);
    const connection = readText(args[0], context);
    if (isFormulaError(connection)) return connection;
    const kpiName = readText(args[1], context);
    if (isFormulaError(kpiName)) return kpiName;
    const property = readInteger(args[2], context);
    if (isFormulaError(property)) return property;
    if (property < 1 || property > 6) return createFormulaError(FormulaErrorCode.Value);
    const caption = readOptionalText(args[3], context);
    if (isFormulaError(caption)) return caption;
    const result = readCubeQuery(
      {
        kind: 'kpi-member',
        connection,
        kpiName,
        property: property as 1 | 2 | 3 | 4 | 5 | 6,
        ...(caption === undefined ? {} : { caption }),
      },
      context,
    );
    return isFormulaError(result) || isCubeMember(result) ? result : createFormulaError(FormulaErrorCode.Value);
  },
};
