import { type CellCommitStrategyRegistry, type SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import { type SheetFindSource } from './findSheetMatches';

/** Search source plus the cell commit policy used for replacements. */
export interface SheetFindReplaceSource extends SheetFindSource {
  readonly commitStrategies: Pick<CellCommitStrategyRegistry, 'commit'>;
  readonly inputValidation?: Pick<SheetCellInputValidationRegistry, 'validate'>;
}
