import { Pipeline, PipelineStep, PipelineStepKind, PipelineLifecycle } from '@searsuite/sear-assembly-plugin';

/**
 * Console logger middleware for Pipeline lifecycle events.
 *
 * Registers as a PipelineLifecycle hook and emits styled console
 * output at each stage:
 *
 *     🚀 Pipeline: edit-exit-and-select (3 steps)
 *       📝 commit-cell-value  → set R0C0 = {richtext}
 *       ✅ commit-cell-value
 *       📝 exit-edit-mode  → clear editor
 *       ✅ exit-edit-mode
 *       🏁 Pipeline committed
 *
 * This is the **only** place that touches console — the execution
 * engine and caller code are fully decoupled from logging.
 */
export class ConsolePipelineLogger implements PipelineLifecycle {
  /** Handles the start lifecycle event. */
  onStart(pipeline: Pipeline): void {
    const steps = pipeline.steps;
    console.group(
      `%c🚀 Pipeline: ${pipeline.name}` + `%c  (${steps.length} step${steps.length !== 1 ? 's' : ''})`,
      'color: #6366f1; font-weight: bold; font-size: 13px;',
      'color: #9ca3af; font-size: 11px;',
    );
  }

  /** Handles the step start lifecycle event. */
  onStepStart(step: PipelineStep, _pipeline: Pipeline, detail: string): void {
    const isInvalidation = step.kind === PipelineStepKind.Invalidate;
    const icon = isInvalidation ? '🔔' : '📝';
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
  onComplete(_pipeline: Pipeline): void {
    console.log('%c  🏁 Pipeline committed', 'color: #6366f1; font-style: italic;');
    console.groupEnd();
  }
}
