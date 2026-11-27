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
