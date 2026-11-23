/** A host-owned confirmation with explicit, localizable presentation text. */
export interface UserConfirmationRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/** Host-provided, editor-local requests for a user's decision. */
export abstract class UserInteractionService {
  public static readonly symbol: symbol = Symbol.for('UserInteractionService');

  /** Resolves true only when the user explicitly confirms. */
  public abstract confirm(request: UserConfirmationRequest): Promise<boolean>;

  /** Cancels pending requests and releases host resources. */
  public abstract destroy(): void;
}
