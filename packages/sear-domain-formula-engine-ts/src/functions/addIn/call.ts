import {
  FormulaAddInServiceDefinition,
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaServiceCacheStatus,
  createFormulaError,
  isFormulaError,
  type FormulaAddInCall,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

/**
 * Calls a host-authorized add-in procedure by registration id or module signature.
 * Example: `=CALL("example","entry","JJ",1)` invokes `entry` with the argument `1`.
 */
export const CALL: FormulaFunction = {
  name: 'CALL',
  descriptor: {
    version: 1,
    summary: 'Calls a procedure exposed by a host-authorized add-in service.',
    category: 'Add-in and Automation',
    example: '=CALL("example","entry","JJ",1)',
    parameters: [
      {
        name: 'registration_or_module',
        description: 'Registration id or module name.',
        accepts: ['number', 'text', 'cell'],
      },
      {
        name: 'procedure_or_argument',
        description: 'Procedure name or first registered-call argument.',
        optional: true,
        accepts: ['any'],
      },
      {
        name: 'type_text_or_argument',
        description: 'Procedure signature or registered-call argument.',
        optional: true,
        accepts: ['any'],
      },
      { name: 'argument', description: 'Procedure argument.', optional: true, repeating: true, accepts: ['any'] },
    ],
    returnKind: 'scalar-or-array',
    externalServices: [FormulaAddInServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length < 1) return createFormulaError(FormulaErrorCode.Value);
    const reader = new FormulaFunctionArguments(args, context);
    const first = reader.value(0);
    if (isFormulaError(first)) return first;

    let request: FormulaAddInCall;
    if (typeof first === 'number' && Number.isInteger(first)) {
      const callArguments = readArguments(reader, 1, args.length);
      if (isFormulaError(callArguments)) return callArguments;
      request = { kind: 'registered', registrationId: first, arguments: callArguments };
    } else {
      if (args.length < 3) return createFormulaError(FormulaErrorCode.Value);
      const module = reader.text(0);
      const procedure = reader.text(1);
      const typeText = reader.text(2);
      if (isFormulaError(module)) return module;
      if (isFormulaError(procedure)) return procedure;
      if (isFormulaError(typeText)) return typeText;
      const callArguments = readArguments(reader, 3, args.length);
      if (isFormulaError(callArguments)) return callArguments;
      request = { kind: 'direct', module, procedure, typeText, arguments: callArguments };
    }

    const result = context.externalServices?.get(FormulaAddInServiceDefinition)?.call(request);
    return result?.status === FormulaServiceCacheStatus.Ready
      ? result.value
      : createFormulaError(FormulaErrorCode.NotAvailable);
  },
};

function readArguments(
  reader: FormulaFunctionArguments,
  start: number,
  length: number,
): readonly FormulaValue[] | ReturnType<typeof createFormulaError> {
  const values: FormulaValue[] = [];
  for (let index = start; index < length; index += 1) {
    const value = reader.value(index);
    if (isFormulaError(value)) return value;
    values.push(value);
  }
  return values;
}
