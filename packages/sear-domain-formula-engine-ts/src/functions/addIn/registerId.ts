import {
  FormulaAddInServiceDefinition,
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaServiceCacheStatus,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';

/**
 * Resolves a host-authorized add-in procedure to a stable numeric registration id.
 * Example: `=REGISTER.ID("example","entry","JJ")` returns the host's handle for `entry`.
 */
export const REGISTER_ID: FormulaFunction = {
  name: 'REGISTER.ID',
  descriptor: {
    version: 1,
    summary: 'Returns the registration id of a procedure exposed by a host-authorized add-in service.',
    category: 'Add-in and Automation',
    example: '=REGISTER.ID("example","entry","JJ")',
    parameters: [
      { name: 'module_text', description: 'Host-authorized module name.', accepts: ['text', 'cell'] },
      { name: 'procedure', description: 'Procedure name.', accepts: ['text', 'cell'] },
      { name: 'type_text', description: 'Optional procedure signature.', optional: true, accepts: ['text', 'cell'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaAddInServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return createFormulaError(FormulaErrorCode.Value);
    const reader = new FormulaFunctionArguments(args, context);
    const module = reader.text(0);
    const procedure = reader.text(1);
    const typeText = args.length === 3 ? reader.text(2) : undefined;
    if (isFormulaError(module)) return module;
    if (isFormulaError(procedure)) return procedure;
    if (isFormulaError(typeText)) return typeText;
    const request = typeText === undefined ? { module, procedure } : { module, procedure, typeText };
    const result = context.externalServices?.get(FormulaAddInServiceDefinition)?.resolveRegistration(request);
    return result?.status === FormulaServiceCacheStatus.Ready
      ? result.value
      : createFormulaError(FormulaErrorCode.NotAvailable);
  },
};
