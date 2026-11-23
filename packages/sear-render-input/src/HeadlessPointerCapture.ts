import { Injectable } from '@searsuite/sear-foundation-di';

import { PointerCapture, type PointerCaptureHandlers } from './PointerCapture';

/** No-op pointer capture adapter for hosts without a pointer event source. */
@Injectable()
export class HeadlessPointerCapture extends PointerCapture {
  /** @inheritdoc */
  public override start(_handlers: PointerCaptureHandlers): () => void {
    return () => void 0;
  }

  /** @inheritdoc */
  public override stop(): void {}
}
