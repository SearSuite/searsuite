import { type SheetRangeMoveContext } from './SheetRangeMoveContribution';
import { type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Canonical outcomes shared by move preview and execution. */
export const SheetRangeMoveStatus = {
  Allowed: 'allowed',
  RequiresConfirmation: 'requiresConfirmation',
  Blocked: 'blocked',
} as const;

/** A move assessment contains no operations and never mutates document state. */
export type SheetRangeMoveAnalysis =
  | {
      readonly status: typeof SheetRangeMoveStatus.Allowed | typeof SheetRangeMoveStatus.RequiresConfirmation;
      readonly context: SheetRangeMoveContext;
    }
  | {
      readonly status: typeof SheetRangeMoveStatus.Blocked;
      readonly context: SheetRangeMoveContext;
      readonly issue: {
        readonly ownerId: string;
        readonly code: string;
        readonly message: string;
        readonly details: SearErrorDetails;
      };
    };
