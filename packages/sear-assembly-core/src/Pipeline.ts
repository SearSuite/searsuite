import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Operation, RectOTActionName, MatrixOTActionName, RichDocOTActionName } from '@searsuite/sear-domain-ot';
import { type SheetInteractionSignal } from './SheetInteractionStore';

// ─── Pipeline lifecycle hooks ───────────────────────────────────────────

/** Observer hooks emitted while a pipeline executes. */
export interface PipelineLifecycle {
  /** Pipeline begins execution. */
  onStart?(pipeline: Pipeline): void;
  /** A single step is about to execute. Receives auto-derived detail. */
  onStepStart?(step: PipelineStep, pipeline: Pipeline, detail: string): void;
  /** A single step has finished executing. */
  onStepComplete?(step: PipelineStep, pipeline: Pipeline): void;
  /** Pipeline finished (all steps + render). */
  onComplete?(pipeline: Pipeline, rendered: boolean): void;
}

// ─── Discriminator ──────────────────────────────────────────────────────

/** Built-in pipeline step kinds understood by SearCoreSheet. */
export enum PipelineStepKind {
  /** Stage a Transaction for atomic commit after every pipeline step succeeds. */
  Transaction = 'transaction',
  /** Re-render a single plugin (no state change). */
  Render = 'render',
  /** Re-render after the current frame's dirty regions have been flushed. */
  PostRender = 'post-render',
  /** Update local sheet interaction state; never synchronized through OT. */
  Interaction = 'interaction',
  /** Run a command-owned local action; never synchronized through OT. */
  LocalAction = 'local-action',
  /** Prepare a local resource and return its rollback for failed staging. */
  PreparedAction = 'prepared-action',
  /** Publish a command-owned local state change only after staging succeeds. */
  PostCommit = 'post-commit',
}

// ─── PipelineStep ───────────────────────────────────────────────────────

/** One ordered unit of work inside a pipeline. */
export interface PipelineStep {
  /** Human-readable step name used by diagnostics. */
  name: string;
  /** Built-in or extension-provided executor key. */
  kind: PipelineStepKind | string;
  /** Transaction payload for transaction steps. */
  transaction?: Transaction;
  /** Plugin key to re-render for render steps. */
  renderPluginKey?: PluginKey;
  /** Local interaction transition for interaction steps. */
  interaction?: SheetInteractionSignal;
  /** Command-owned action for local-action steps. */
  localAction?: () => void;
  /** Local preparation that returns its rollback action. */
  prepare?: () => () => void;
  /** Deferred local state publication after document and interaction commits. */
  postCommit?: () => void;
  /** Extension-owned payload for a custom step executor. */
  data?: unknown;
}

// ─── Auto-derive detail from operations ─────────────────────────────────

/**
 * Produce a domain-readable summary from a Transaction's operations.
 *
 * The function inspects each OT operation and maps it to a concise
 * description — no caller needs to hardcode anything.
 *
 * Example outputs:
 *   "select R0C0:R3C5"       (two UpdateRect ops with the same range)
 *   "set R2C5 = {richtext}"  (one UpdateCell op)
 *   "insert row at 3"        (one RowInsert op)
 */
/** Format a value concisely for logging. */
function fmtValue(x: unknown): string {
  if (x === null || x === void 0) return '∅';
  if (typeof x === 'object' && x !== null && 'type' in x)
    return `{${Reflect.get(x, 'type')}}`;
  if (typeof x === 'string') {
    const s = x as string;
    return `"${s.length > 20 ? s.slice(0, 17) + '…"' : s}"`;
  }
  return JSON.stringify(x);
}

/** Format a RichDoc path (e.g. [0,2,3] → "para[0].node[2].offset 3") */
function fmtPath(p: (string | number)[]): string {
  if (p.length === 0) return 'root';
  if (p.length === 1) return `[${p[0]}]`; // e.g. row index
  if (p.length === 2) return `para[${p[0]}].node[${p[1]}]`;
  // [paraIdx, nodeIdx, offset] — rich doc character path
  return `para[${p[0]}].node[${p[1]}].${p[2]}`;
}

function summarizeTransaction(tx: Transaction): string {
  const ops = tx.operations;
  if (ops.length === 0) return '(empty)';

  // Collect all distinct action types across ops
  const parts: string[] = [];

  for (const op of ops) {
    const keys = Object.keys(op).filter((k) => k !== 'p');
    for (const key of keys) {
      const val = Reflect.get(op, key);
      switch (key) {
        case RectOTActionName.UpdateRect: {
          // 'ur'
          // val is [Point, Point] — a cell range
          const range = val as [number[], number[]];
          const anchor = range[0];
          const focus = range[1];
          parts.push(`select R${anchor[0]}C${anchor[1]}:R${focus[0]}C${focus[1]}`);
          break;
        }
        case MatrixOTActionName.UpdateCell: {
          // 'uc'
          // val is { value, prev } — a cell value change
          const change = val as { value?: unknown; prev?: unknown };
          const path = op.p;
          parts.push(`set R${path[0]}C${path[1]} = ${fmtValue(change.value)}`);
          break;
        }
        case MatrixOTActionName.RowInsert: {
          parts.push(`insert row at ${op.p[0]}`);
          break;
        }
        case MatrixOTActionName.RowDelete: {
          parts.push(`delete row at ${op.p[0]}`);
          break;
        }
        case MatrixOTActionName.RowMove: {
          parts.push(`move row ${op.p[0]}`);
          break;
        }
        case MatrixOTActionName.ColInsert: {
          parts.push(`insert col at ${op.p[0]}`);
          break;
        }
        case MatrixOTActionName.ColDelete: {
          parts.push(`delete col at ${op.p[0]}`);
          break;
        }
        case MatrixOTActionName.ColMove: {
          parts.push(`move col ${op.p[0]}`);
          break;
        }
        // ─── RichDocOT operations (inline editing) ──────────────
        case RichDocOTActionName.StringInsert: {
          // 'si'
          const str = val as string;
          parts.push(`+"${str.length > 20 ? str.slice(0, 17) + '…' : str}" at ${fmtPath(op.p)}`);
          break;
        }
        case RichDocOTActionName.StringDelete: {
          // 'sd'
          const str = val as string;
          parts.push(`-"${str.length > 20 ? str.slice(0, 17) + '…' : str}" at ${fmtPath(op.p)}`);
          break;
        }
        case RichDocOTActionName.NodeInsert: {
          // 'ni'
          const schema = val as Record<string, unknown>;
          const tag = schema['tag'] ?? 'node';
          parts.push(`+<${tag}> at ${fmtPath(op.p)}`);
          break;
        }
        case RichDocOTActionName.NodeDelete: {
          // 'nd'
          const schema = val as Record<string, unknown>;
          const tag = schema['tag'] ?? 'node';
          parts.push(`-<${tag}> at ${fmtPath(op.p)}`);
          break;
        }
        case RichDocOTActionName.NodeMove: {
          // 'nm'
          const dest = (val as number[])[0];
          parts.push(`move node → ${dest} at ${fmtPath(op.p)}`);
          break;
        }
        case RichDocOTActionName.UpdateAttrs: {
          // 'ua'
          const change = val as { value?: unknown; prev?: unknown };
          parts.push(`attrs at ${fmtPath(op.p)}: ${fmtValue(change.value)} → ${fmtValue(change.prev)}`);
          break;
        }
        default: {
          parts.push(`${key} ${JSON.stringify(op.p)}`);
          break;
        }
      }
    }
  }

  // De-duplicate adjacent identical "select" parts (common in selection tx)
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== p) deduped.push(p);
  }

  return deduped.join(', ');
}

/**
 * Derive a human-readable detail string for any PipelineStep.
 * Transaction steps → summarize their operations.
 * Render steps → show the plugin key.
 */
function deriveStepDetail(step: PipelineStep): string {
  if (step.kind === PipelineStepKind.Transaction && step.transaction) {
    return summarizeTransaction(step.transaction);
  }
  if (step.kind === PipelineStepKind.Render && step.renderPluginKey) {
    return `render ${step.renderPluginKey.key}`;
  }
  if (step.kind === PipelineStepKind.PostRender && step.renderPluginKey) {
    return `post-render ${step.renderPluginKey.key}`;
  }
  if (step.kind === PipelineStepKind.Interaction && step.interaction) {
    return step.interaction.type;
  }
  if (step.kind === PipelineStepKind.LocalAction || step.kind === PipelineStepKind.PreparedAction) {
    return step.name;
  }
  if (step.kind === PipelineStepKind.PostCommit) return step.name;
  return step.name;
}

// ─── Pipeline class ─────────────────────────────────────────────────────

/**
 * An observable, ordered conduit for state changes and renders.
 *
 * The Pipeline is **not** a batch-optimisation — it is a monitoring and
 * debugging tool.  Every operation (transaction dispatch, render-only
 * refresh, editor input, cell selection…) should be pushed through a
 * Pipeline so that the full lifecycle is logged and traceable.
 *
 * Lifecycle hooks (PipelineLifecycle) can be registered via `use()`.
 * The execution engine calls these hooks at each stage, keeping the
 * Pipeline itself decoupled from any specific logging or metrics logic.
 *
 * Usage:
 * ```ts
 * // A single-transaction dispatch (selection, collab, etc.)
 * const p = Pipeline.fromTransaction('select-cell', tx);
 * searCore.executePipeline(p);
 *
 * // A multi-step operation (edit-exit-and-select)
 * const p = new Pipeline(featurePipelineName);
 * p.add(featureCommitStepName, cellValueTx);
 * p.add(featureCleanupStepName, cleanupTx);
 * p.addRender(featureRefreshStepName, selectionPluginKey);
 * p.markDirty(editorRect);
 * searCore.executePipeline(p);
 * ```
 */
export class Pipeline {
  /** Ordered steps that will be executed by the pipeline executor. */
  public readonly steps: PipelineStep[] = [];
  /** Dirty rectangles accumulated before the render phase. */
  public readonly dirtyRects: PositionRect<HexColor>[] = [];
  readonly #hooks: PipelineLifecycle[] = [];

  /** Creates a named pipeline for diagnostics and command results. */
  constructor(public readonly name: string) {}

  // ─── Hook registration ─────────────────────────────────────────

  /** Register a lifecycle hook (middleware).  Hooks fire in registration order. */
  use(hook: PipelineLifecycle): this {
    this.#hooks.push(hook);
    return this;
  }

  // ─── Step constructors ──────────────────────────────────────────

  /** Append a transaction step. */
  addTransaction(stepName: string, transaction: Transaction): this {
    this.steps.push({
      name: stepName,
      kind: PipelineStepKind.Transaction,
      transaction,
    });
    return this;
  }

  /** Append a transaction step (shorthand). */
  add(stepName: string, transaction: Transaction): this {
    return this.addTransaction(stepName, transaction);
  }

  /** Append a render-only step for the given plugin. */
  addRender(stepName: string, pluginKey: PluginKey): this {
    this.steps.push({
      name: stepName,
      kind: PipelineStepKind.Render,
      renderPluginKey: pluginKey,
    });
    return this;
  }

  /**
   * Schedule a visual refresh after this pipeline's normal frame has
   * completed. Use this when a second scene update must not consume dirty
   * regions produced by transaction-driven plugins in the same frame.
   */
  addPostRender(stepName: string, pluginKey: PluginKey): this {
    this.steps.push({
      name: stepName,
      kind: PipelineStepKind.PostRender,
      renderPluginKey: pluginKey,
    });
    return this;
  }

  /** Append a local interaction-state transition. */
  addInteraction(stepName: string, interaction: SheetInteractionSignal): this {
    this.steps.push({
      name: stepName,
      kind: PipelineStepKind.Interaction,
      interaction,
    });
    return this;
  }

  /** Append a command-owned local action step. */
  addLocalAction(stepName: string, localAction: () => void): this {
    this.steps.push({
      name: stepName,
      kind: PipelineStepKind.LocalAction,
      localAction,
    });
    return this;
  }

  /** Prepare an editor-local resource that is released if later staging fails. */
  addPreparedAction(stepName: string, prepare: () => () => void): this {
    this.steps.push({ name: stepName, kind: PipelineStepKind.PreparedAction, prepare });
    return this;
  }

  /** Append a local state publication deferred until all steps have staged successfully. */
  addPostCommit(stepName: string, postCommit: () => void): this {
    this.steps.push({ name: stepName, kind: PipelineStepKind.PostCommit, postCommit });
    return this;
  }

  /** Add a step handled by an executor registered by the host or an extension. */
  addCustom(stepName: string, kind: string, data?: unknown): this {
    this.steps.push({ name: stepName, kind, data });
    return this;
  }

  // ─── Deferred dirty rects ────────────────────────────────────────

  /** Defers a dirty rectangle until the pipeline executor reaches render. */
  markDirty(rect: PositionRect<HexColor>): this {
    this.dirtyRects.push(rect);
    return this;
  }

  // ─── Lifecycle dispatch ──────────────────────────────────────────

  /** Notify all hooks that the pipeline is starting. */
  emitStart(): void {
    for (const hook of this.#hooks) hook.onStart?.(this);
  }

  /** Notify all hooks that a step is starting. Provides auto-derived detail. */
  emitStepStart(step: PipelineStep): void {
    const detail = deriveStepDetail(step);
    for (const hook of this.#hooks) hook.onStepStart?.(step, this, detail);
  }

  /** Notify all hooks that a step has completed. */
  emitStepComplete(step: PipelineStep): void {
    for (const hook of this.#hooks) hook.onStepComplete?.(step, this);
  }

  /** Notify all hooks that the pipeline has completed. */
  emitComplete(rendered: boolean): void {
    for (const hook of this.#hooks) hook.onComplete?.(this, rendered);
  }

  // ─── Factory helpers ─────────────────────────────────────────────

  /** Creates a pipeline containing one transaction step. */
  static fromTransaction(name: string, transaction: Transaction): Pipeline {
    return new Pipeline(name).add(name, transaction);
  }

  /** Creates a pipeline containing one render step for a plugin key. */
  static fromRender(name: string, pluginKey: PluginKey): Pipeline {
    return new Pipeline(name).addRender(name, pluginKey);
  }
}
