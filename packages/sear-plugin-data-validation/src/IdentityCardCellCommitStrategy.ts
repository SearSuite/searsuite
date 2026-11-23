import {
  CellType,
  type CellCommitContext,
  type CellCommitStrategyDefinition,
  type CellMatrixElement,
} from '@searsuite/sear-domain-cell-types';
import { type DataValidationMatrix } from './DataValidationMatrix';
import { DataValidationKind } from './DataValidationRule';

/** Preserves all digits when an identity rule covers a numeric-looking input. */
export class IdentityCardCellCommitStrategy implements CellCommitStrategyDefinition {
  public readonly key = 'sheet.dataValidation.identityCardText';
  public readonly priority = 11;

  public constructor(private readonly readRules: () => DataValidationMatrix) {}

  public matches({ row, col, plainText }: CellCommitContext): boolean {
    return /^\d{18}$/.test(plainText) && this.readRules().findRules(row, col)
      .some(({ rule }) => rule.condition.kind === DataValidationKind.IdentityCard);
  }

  public commit({ plainText }: CellCommitContext): CellMatrixElement {
    return { type: CellType.String, value: plainText };
  }
}
