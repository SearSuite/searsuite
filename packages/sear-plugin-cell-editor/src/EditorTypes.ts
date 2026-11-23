import { Rect as RectRange } from '@searsuite/sear-foundation-rect';

/**
 * Plugin state tuple:
 *   [0] anchorRect  — which cell is the edit anchor (for position computation)
 *   [1] focusRect   — which cell range is being edited (shown as the editor box)
 *   [2] docSelection — text selection inside the editor:
 *                      getPoint(0) = [paraIndex, charOffset] for anchor
 *                      getPoint(1) = [paraIndex, charOffset] for head
 */
export type EditorState = [RectRange, RectRange, RectRange];

// Editor border color. The plugin returns `false` from `onDblClick` to prevent
// subsequent plugins (such as SheetSelectionPlugin) from responding to the same
// double-click, avoiding duplicate same-color stroke overlap.
export const EDITOR_BORDER_COLOR = 'rgba(56, 110, 246, 1)';

/** Cursor blink interval in milliseconds (matches typical OS cursor blink rate). */
export const CURSOR_BLINK_INTERVAL_MS = 530;
