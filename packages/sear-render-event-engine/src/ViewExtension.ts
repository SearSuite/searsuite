import { type StateOwnerKey } from '@searsuite/sear-domain-state';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { type PositionRect } from '@searsuite/sear-foundation-rect';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { type EventWithOffsetAndTarget } from './EventEngine';

/** Explicit presentation role; state owners cannot register as views accidentally. */
export const ViewExtensionRole: unique symbol = Symbol('ViewExtensionRole');

/** Optional presentation of state read through a host-owned view context. */
export interface ViewExtension<Context, Properties extends NodeProperties> {
  /** Identifies this contribution as presentation rather than a document state owner. */
  readonly [ViewExtensionRole]: true;
  /** Stable identity used to register and dispose this contribution within one editor. */
  readonly key: StateOwnerKey;
  /** Orders scene contributions; native input follows view registration order. */
  readonly depth?: number;
  /** Enables diagnostics when presentation priorities collide. */
  readonly warnOnDuplicateDepth?: boolean;
  /** Supplies display defaults before the first scene is constructed. */
  registerConfig?(): Array<{
    /** Stable identity used to register and dispose this contribution within one editor. */
    key: StateOwnerKey /** Editor-local defaults and configuration contributions. */;
    config: object;
  }>;
  /** Binds presentation services after every view contribution has been registered. */
  initializeView?(context: Context): void;
  /** Synchronizes view-local resources after a successful state publication and before painting. */
  onCommit?(context: Context): void;
  /** Releases this presentation and its native listeners without changing document state. */
  destroyView?(): void;
  /** Reads committed state and returns retained nodes for the current viewport. */
  render?(context: Context, offset?: { x: number; y: number }): Node<Properties> | Node<Properties>[] | null;
  /** Computes view-local damage from committed changes when partial repainting is supported. */
  dirtyRect?(context: Context, transaction: Transaction): PositionRect<unknown> | null | undefined;
  /** Refreshes view-local geometry after the host viewport changes. */
  onResize?(): void;
  /** Receives viewport movement without modifying document content. */
  onScroll?(state: ScrollManagerState): void;
  /** Translates a click into typed commands; false consumes the event. */
  onClick?(context: Context, event: EventWithOffsetAndTarget<Properties>): boolean | void;
  /** Translates a double click into typed commands; false consumes the event. */
  onDblClick?(context: Context, event: EventWithOffsetAndTarget<Properties>): boolean | void;
  /** Begins a pointer gesture through typed commands; false consumes the event. */
  onMouseDown?(context: Context, event: EventWithOffsetAndTarget<Properties>): boolean | void;
  /** Updates a view-owned pointer gesture; false consumes the event. */
  onMouseMove?(context: Context, event: EventWithOffsetAndTarget<Properties>): boolean | void;
  /** Ends a view-owned pointer gesture and releases capture; false consumes the event. */
  onMouseUp?(context: Context, event: EventWithOffsetAndTarget<Properties>): boolean | void;
}
