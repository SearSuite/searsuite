import { DocCaretView } from './runtimePlugin/caret/DocCaretView';
import { DocCompositionView } from './runtimePlugin/composition/DocCompositionView';
import { DocTextInputView } from './runtimePlugin/textInput/DocTextInputView';
import { DocSelectionView } from './runtimePlugin/selection/DocSelectionView';
import { DocContentView } from './runtimePlugin/contentRender/DocContentView';
import { DocTextStyleView } from './DocTextStyleView';
export * from './runtimePlugin/caret/DocCaretView';
export * from './runtimePlugin/composition/DocCompositionView';
export * from './runtimePlugin/textInput/DocTextInputView';
export * from './runtimePlugin/selection/DocSelectionView';
export * from './runtimePlugin/contentRender/DocContentView';
export * from './runtimePlugin/debugOverlay/DocDebugOverlayView';
export { DocTextStyleView } from './DocTextStyleView';
/** Native input and scene contributions, independent of document state plugins. */
export const DefaultDocViews = [
  DocCompositionView,
  DocTextInputView,
  DocSelectionView,
  DocCaretView,
  DocTextStyleView,
  DocContentView,
] as const;
