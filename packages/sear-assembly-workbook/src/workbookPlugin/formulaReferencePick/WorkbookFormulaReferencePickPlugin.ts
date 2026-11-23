import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SearError } from '@searsuite/sear-foundation-error';
import { SheetRuntimeCapability } from '@searsuite/sear-assembly-setup';
import type { Point } from '@searsuite/sear-foundation-rect';
import {
  CancelCellEditCommand,
  FormulaReferencePickService,
  ReadFormulaEditDraftQuery,
  RestoreFormulaEditDraftCommand,
  findTrailingSheetQualifierStart,
  formatPickedReference,
  type FormulaEditDraft,
} from '@searsuite/sear-plugin-cell-editor';
import { EnsureSelectionVisibleCommand } from '@searsuite/sear-plugin-selection';
import { ActivateWorkbookSheetCommand } from '../../WorkbookCommands';
import type { WorkbookCommandBus } from '../../WorkbookCommandBus';
import {
  CancelWorkbookFormulaReferencePickCommand,
  CaptureWorkbookFormulaDraftCommand,
  PickWorkbookFormulaReferenceCommand,
  RestoreWorkbookFormulaDraftCommand,
} from './WorkbookFormulaReferencePickCommands';
import {
  WorkbookPlugin,
  type WorkbookCompanionSheetService,
  type WorkbookPluginContext,
} from '../../WorkbookPluginContracts';
import type { WorkbookTransactionCommittedEvent } from '../../WorkbookTransaction';

/** Retains one formula edit while its source sheet is temporarily unmounted. */
@Injectable()
export class WorkbookFormulaReferencePickPlugin extends WorkbookPlugin implements FormulaReferencePickService {
  public static readonly symbol = Symbol.for('WorkbookFormulaReferencePickPlugin');
  #context: WorkbookPluginContext | null = null;
  #pending: { sourceId: string; draft: FormulaEditDraft; reference?: string } | null = null;
  #returnTimer: number | null = null;
  #revealTimer: number | null = null;
  #disposePendingEscape: (() => void) | null = null;

  constructor(@Inject(Platform.symbol) private readonly platform: Platform) {
    super();
  }

  public getSheetServices(): readonly WorkbookCompanionSheetService[] {
    return [{ token: FormulaReferencePickService.symbol, value: this }];
  }

  public registerCommands(commands: WorkbookCommandBus): void {
    commands.register(CaptureWorkbookFormulaDraftCommand, () => this.captureDraft());
    commands.register(PickWorkbookFormulaReferenceCommand, (input) => this.applyPickedReference(input.start, input.end));
    commands.register(CancelWorkbookFormulaReferencePickCommand, () => this.cancelPick());
    commands.register(RestoreWorkbookFormulaDraftCommand, () => this.restoreAtSource());
  }

  public initialize(context: WorkbookPluginContext): () => void {
    this.#context = context;
    return () => {
      this.#disposePendingEscape?.();
      this.#disposePendingEscape = null;
      if (this.#returnTimer !== null) this.platform.clearTimeout(this.#returnTimer);
      if (this.#revealTimer !== null) this.platform.clearTimeout(this.#revealTimer);
      this.#returnTimer = null;
      this.#revealTimer = null;
      this.#pending = null;
      this.#context = null;
    };
  }

  public onBeforeSheetActivation(): void {
    this.#context?.runtime.commands.run(CaptureWorkbookFormulaDraftCommand, void 0);
  }

  public onSheetActivationFailed(): void {
    this.#context?.runtime.commands.run(RestoreWorkbookFormulaDraftCommand, void 0);
    this.bindPendingEscape();
  }

  public onTransactionCommitted(event: WorkbookTransactionCommittedEvent): void {
    if (event.before.activeSheetId === event.after.activeSheetId) return;
    this.#context?.runtime.commands.run(RestoreWorkbookFormulaDraftCommand, void 0);
    this.bindPendingEscape();
  }

  public hasPendingPick(): boolean {
    const runtime = this.#context?.runtime;
    return !!this.#pending && !!runtime && runtime.sheets.getActiveId() !== this.#pending.sourceId;
  }

  public pick(start: Point, end: Point): void {
    this.#context?.runtime.commands.run(PickWorkbookFormulaReferenceCommand, { start, end });
  }

  private applyPickedReference(start: Point, end: Point): void {
    this.#assertCommandBoundary();
    const pending = this.#pending;
    const runtime = this.#context?.runtime;
    if (!pending || !runtime || !this.hasPendingPick()) return;
    const targetId = runtime.sheets.getActiveId();
    const target = runtime.document.getState().sheets.find((sheet) => sheet.id === targetId);
    if (!target) return;
    pending.reference = formatPickedReference(start, end, target.name);
    if (pending.draft.selectionStart === pending.draft.selectionEnd) {
      const qualifierStart = findTrailingSheetQualifierStart(pending.draft.text, pending.draft.selectionStart);
      if (qualifierStart !== null) pending.draft = { ...pending.draft, selectionStart: qualifierStart };
    }
    if (this.#returnTimer !== null) this.platform.clearTimeout(this.#returnTimer);
    this.#returnTimer = this.platform.setTimeout(() => {
      this.#returnTimer = null;
      if (this.#pending !== pending || !this.#context) return;
      this.#context.runtime.commands.run(ActivateWorkbookSheetCommand, { sheetId: pending.sourceId });
    }, 0);
  }

  public cancelPendingPick(): void {
    this.#context?.runtime.commands.run(CancelWorkbookFormulaReferencePickCommand, void 0);
  }

  private cancelPick(): void {
    this.#assertCommandBoundary();
    const pending = this.#pending;
    if (!pending || !this.#context) return;
    this.#pending = null;
    this.#disposePendingEscape?.();
    this.#disposePendingEscape = null;
    if (this.#returnTimer !== null) this.platform.clearTimeout(this.#returnTimer);
    this.#returnTimer = this.platform.setTimeout(() => {
      this.#returnTimer = null;
      this.#context?.runtime.commands.run(ActivateWorkbookSheetCommand, { sheetId: pending.sourceId });
    }, 0);
  }

  private captureDraft(): void {
    this.#assertCommandBoundary();
    if (this.#pending) return;
    const runtime = this.#context?.runtime;
    if (!runtime) return;
    const editor = runtime.sheets.getActiveEditor();
    if (!editor.queries.has(ReadFormulaEditDraftQuery) || !editor.commands.has(CancelCellEditCommand)) return;
    const draft = editor.queries.run(ReadFormulaEditDraftQuery, void 0);
    if (!draft) return;
    editor.commands.run(CancelCellEditCommand, void 0);
    this.#pending = { sourceId: runtime.sheets.getActiveId(), draft };
  }

  private restoreAtSource(): void {
    this.#assertCommandBoundary();
    const pending = this.#pending;
    const runtime = this.#context?.runtime;
    if (!pending || !runtime || runtime.sheets.getActiveId() !== pending.sourceId) return;
    const editor = runtime.sheets.getActiveEditor();
    if (!editor.commands.has(RestoreFormulaEditDraftCommand)) return;
    editor.commands.run(RestoreFormulaEditDraftCommand, {
      draft: pending.draft,
      ...(pending.reference ? { reference: pending.reference } : {}),
    });
    if (this.#revealTimer !== null) this.platform.clearTimeout(this.#revealTimer);
    this.#revealTimer = this.platform.setTimeout(() => {
      this.#revealTimer = null;
      if (!this.#context || runtime.sheets.getActiveId() !== pending.sourceId) return;
      const mountedEditor = runtime.sheets.getActiveEditor();
      if (mountedEditor !== editor || !mountedEditor.commands.has(EnsureSelectionVisibleCommand)) return;
      mountedEditor.commands.run(EnsureSelectionVisibleCommand, {
        anchor: pending.draft.cell,
        focus: pending.draft.cell,
      });
    }, 0);
    this.#pending = null;
  }

  private bindPendingEscape(): void {
    this.#disposePendingEscape?.();
    this.#disposePendingEscape = null;
    if (!this.hasPendingPick()) return;
    this.#disposePendingEscape = this.#context?.runtime.sheets
      .getActiveEditor()
      .services.require(SheetRuntimeCapability.Input)
      .keyboard.subscribe({
        onEscape: () => this.cancelPendingPick(),
        onUnhandledEscape: () => this.cancelPendingPick(),
      }) ?? null;
  }

  #assertCommandBoundary(): void {
    if (!this.#context?.runtime.commands.isExecuting()) {
      throw new SearError('Workbook formula reference changes require a Workbook command.');
    }
  }
}
