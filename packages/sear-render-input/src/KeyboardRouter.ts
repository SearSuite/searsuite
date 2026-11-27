import { Input } from './Input';

// ---------------------------------------------------------------------------
// Handler interface
// ---------------------------------------------------------------------------

/**
 * Callbacks for all keyboard-shortcut / action-key events that the editor needs
 * to intercept. These are intentionally separate from text composition events
 * (which remain the responsibility of `TextInput`).
 */
export interface KeyboardRouterHandlers {
  /** Backspace / Delete key, with its deletion direction and word modifier. */
  onDelete?: (direction?: 'backward' | 'forward', byWord?: boolean) => void;
  /** Enter key – commit the current edit. */
  onEnter?: (shiftKey: boolean, primaryModifier?: boolean) => void;
  /** Enters editing while retaining the selected cell's content. */
  onEdit?: () => void;
  /** Escape key – cancel the current edit; return false to leave the key to the host. */
  onEscape?: () => boolean | void;
  /** Escape not handled by a focused host control; return true only when consumed. */
  onUnhandledEscape?: () => boolean;
  /** Cycles the reference at the formula caret through relative and absolute modes. */
  onToggleReference?: () => void;
  onArrowLeft?: (shiftKey: boolean, metaKey: boolean, altKey?: boolean) => void;
  onArrowRight?: (shiftKey: boolean, metaKey: boolean, altKey?: boolean) => void;
  onArrowUp?: (shiftKey: boolean, metaKey: boolean) => void;
  onArrowDown?: (shiftKey: boolean, metaKey: boolean) => void;
  /** Ctrl/Cmd + A – select all content in the editor. */
  onSelectAll?: () => void;
  /** Moves to the start of the active row, or sheet with a primary modifier. */
  onHome?: (primaryModifier: boolean, shiftKey: boolean) => void;
  /** Moves to the last occupied cell of the sheet. */
  onEnd?: (shiftKey: boolean) => void;
  /** Moves the active text caret to the end of its line while editing. */
  onLineEnd?: (shiftKey: boolean) => void;
  /** Moves the active selection by roughly one viewport. */
  onPage?: (direction: -1 | 1, shiftKey: boolean) => void;
  /** Moves the active selection and viewport horizontally by one page. */
  onHorizontalPage?: (direction: -1 | 1, shiftKey: boolean) => void;
  /** Selects the entire active row. */
  onSelectRow?: () => void;
  /** Selects the entire active column. */
  onSelectColumn?: () => void;
  /** Hides the selected rows or columns in a sheet host. */
  onHideRows?: () => void;
  onHideColumns?: () => void;
  /** Opens the selected-cell deletion choices. */
  onDeleteCells?: () => void;
  /** Ctrl/Cmd + B - toggle bold text in the active rich-text editor. */
  onToggleBold?: () => void;
  /** Ctrl/Cmd + I - toggle italic text in the active rich-text editor. */
  onToggleItalic?: () => void;
  /** Ctrl/Cmd + U - toggle underlined text in the active rich-text editor. */
  onToggleUnderline?: () => void;
  /** Ctrl/Cmd + Shift + X - toggle strikethrough text in the active rich-text editor. */
  onToggleStrikethrough?: () => void;
  /** Ctrl/Cmd + C - copy the active sheet selection. */
  onCopy?: () => void;
  /** Ctrl/Cmd + X - cut the active sheet selection. */
  onCut?: () => void;
  /** Ctrl/Cmd + V - paste from the host clipboard. */
  onPaste?: (valuesOnly: boolean) => void;
  /** Ctrl/Cmd + D/R - fill the selection from its top row/left column. */
  onFillDown?: () => void;
  onFillRight?: () => void;
  /** Ctrl+' copies the formula above the active cell exactly. */
  onCopyFormulaAbove?: () => void;
  /** Ctrl+; inserts the current date as a static cell value. */
  onInsertCurrentDate?: () => boolean;
  /** Cmd+; inserts the current time as a static cell value. */
  onInsertCurrentTime?: () => boolean;
  /** Tab / Shift+Tab - move the active sheet selection horizontally. */
  onTab?: (shiftKey: boolean) => void;
  /** Alt/Option + Enter – insert a line break (soft enter) inside the cell. */
  onSoftEnter?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  /** Ctrl/Cmd + Z - undo the latest sheet mutation. */
  onUndo?: () => void;
  /** Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - redo the latest undone mutation. */
  onRedo?: () => void;
}

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

/**
 * Abstract keyboard-shortcut router.
 *
 * Implementations intercept action keys (arrows, Enter, Escape, Backspace,
 * Ctrl+A/B/C/V/X and Tab) and dispatch them to the registered handlers.  Unlike `TextInput`,
 * implementations MUST work regardless of which DOM element currently holds
 * focus – this is the key contract that fixes the "Ctrl+A lost after clicking
 * canvas" problem.
 *
 * Lifecycle:
 *   `startListener()` – attach the listener for the editor instance.
 *   `stopListener()`  – detach it when the editor is destroyed.
 */
export abstract class KeyboardRouter extends Input {
  /** DI token for resolving KeyboardRouter. */
  public static readonly symbol: symbol = Symbol.for('KeyboardRouter');

  /** Installs handlers; implementations may return a disposer that restores the previous handlers. */
  abstract subscribe(handlers: KeyboardRouterHandlers): void | (() => void);
}
