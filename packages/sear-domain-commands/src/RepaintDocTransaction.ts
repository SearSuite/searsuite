import { DocTransaction, DocTransactionRenderOperationType } from './DocTransaction';

/** Document transaction whose RichDoc OT operations only require repainting existing layout. */
export class RepaintDocTransaction extends DocTransaction {
  public override readonly renderOperationType = DocTransactionRenderOperationType.Repaint;
}
