import { Pipeline, PipelineStep, PipelineStepKind, PipelineLifecycle } from './Pipeline';

/**
 * Console logger middleware for Pipeline lifecycle events.
 *
 * Registers as a PipelineLifecycle hook and emits styled console
 * output at each stage:
 *
 *     🚀 Pipeline: edit-exit-and-select (3 steps, 1 dirty)
 *       📝 commit-cell-value  → set R0C0 = {richtext}
 *       ✅ commit-cell-value
 *       📝 exit-edit-mode  → clear editor
 *       ✅ exit-edit-mode
 *       🏁 Pipeline done — rendered
 *
 * This is the **only** place that touches console — the execution
 * engine and caller code are fully decoupled from logging.
 */
export class ConsolePipelineLogger implements PipelineLifecycle {
  /** Handles the start lifecycle event. */
  onStart(pipeline: Pipeline): void {
    const steps = pipeline.steps;
    const dirtyCount = pipeline.dirtyRects.length;
    console.group(
      `%c🚀 Pipeline: ${pipeline.name}` +
        `%c  (${steps.length} step${steps.length !== 1 ? 's' : ''}${dirtyCount ? `, ${dirtyCount} dirty` : ''})`,
      'color: #6366f1; font-weight: bold; font-size: 13px;',
      'color: #9ca3af; font-size: 11px;',
    );
  }

  /** Handles the step start lifecycle event. */
  onStepStart(step: PipelineStep, _pipeline: Pipeline, detail: string): void {
    const isRender = step.kind === PipelineStepKind.Render;
    const icon = isRender ? '🎨' : '📝';
    console.log(
      `%c  ${icon} %c${step.name}  %c→ ${detail}`,
      'color: #f59e0b;', // icon – amber
      'color: #e5e7eb; font-weight: bold;', // step name – white bold
      'color: #38bdf8; font-size: 11px;', // detail – cyan
    );
  }

  /** Handles the step complete lifecycle event. */
  onStepComplete(step: PipelineStep, _pipeline: Pipeline): void {
    console.log(
      `%c  ✅ %c${step.name}`,
      'color: #22c55e;', // check – green
      'color: #9ca3af;', // name – gray
    );
  }

  /** Handles the complete lifecycle event. */
  onComplete(_pipeline: Pipeline, rendered: boolean): void {
    console.log(
      `%c  🏁 Pipeline done${rendered ? ' — rendered' : ' — no render needed'}`,
      'color: #6366f1; font-style: italic;',
    );
    console.groupEnd();
  }
}
