import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaStockHistoryService } from './FormulaStockHistoryService';

/** Stable external-service identity used by STOCKHISTORY and host caches. */
export const FormulaStockHistoryServiceDefinition = defineFormulaExternalService<FormulaStockHistoryService>(
  'formula.stockHistory',
  { subscribeInvalidation: (service, listener) => service.subscribeInvalidation(listener) },
);
