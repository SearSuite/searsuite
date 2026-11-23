import { DocTransaction, DocTransactionRenderOperationType } from './DocTransaction';

/** Document transaction whose RichDoc OT operations may change layout measurement. */
export class ReflowDocTransaction extends DocTransaction {
  public override readonly renderOperationType = DocTransactionRenderOperationType.Reflow;
}
