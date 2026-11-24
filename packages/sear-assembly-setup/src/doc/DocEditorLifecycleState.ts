import { Injectable } from '@searsuite/sear-foundation-di';

/** Tracks standalone document editor lifecycle state inside the DI graph. */
@Injectable()
export class DocEditorLifecycleState {
  /** DI token for resolving the lifecycle state. */
  public static readonly symbol = Symbol.for('DocEditorLifecycleState');

  #destroyed = false;

  /** Returns whether this editor instance has been destroyed. */
  public isDestroyed(): boolean {
    return this.#destroyed;
  }

  /** Marks this editor instance as destroyed. */
  public markDestroyed(): void {
    this.#destroyed = true;
  }
}
