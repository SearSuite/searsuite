import { RichDocOTOperation } from '@searsuite/sear-domain-ot';
import { DocSelection, RichDocNode } from '@searsuite/sear-domain-doc';

/** One atomic document transaction step with its selection mapping logic. */
export interface DocStep {
  /** Rich-document OT operations produced by this step. */
  ops: RichDocOTOperation[];
  /**
   * Maps an existing selection through the step.
   * @param sel - Selection before this step.
   * @param newDoc - Document state after this step.
   * @returns Selection rebased onto newDoc.
   */
  mapSelection(sel: DocSelection, newDoc: RichDocNode[]): DocSelection;
}
