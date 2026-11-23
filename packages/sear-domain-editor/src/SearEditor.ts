import { Injectable } from '@searsuite/sear-foundation-di';

/**
 * Injectable rich-document editor service placeholder.
 *
 * The service owns document-editor initialization once a document assembly root
 * is available. It is bound by symbol so consumers do not depend on string DI
 * tokens.
 */
@Injectable()
export class SearEditor {
  /** DI token for resolving the editor service. */
  public static readonly symbol: symbol = Symbol.for('SearEditor');

  /** Constructs the editor service. */
  constructor() {}

  /** Initializes document-editor runtime state. */
  initialize() {
    // Initialization logic for the SearEditor
  }
}
