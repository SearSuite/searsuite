import { CaretPlugin } from './runtimePlugin/caret/CaretPlugin';
import { CompositionPlugin } from './runtimePlugin/composition/CompositionPlugin';
import { DocContentRenderPlugin } from './runtimePlugin/contentRender/DocContentRenderPlugin';
import { DocDebugOverlayPlugin } from './runtimePlugin/debugOverlay/DocDebugOverlayPlugin';
import { HistoryPlugin } from './runtimePlugin/history/HistoryPlugin';
import {
  FontFamilyTextStylePlugin,
  FontSizeTextStylePlugin,
  BoldTextStylePlugin,
  FontFamilyTextStyleKey,
  FontSizeTextStyleKey,
  BoldTextStyleKey,
  ItalicTextStylePlugin,
  ItalicTextStyleKey,
  UnderlineTextStylePlugin,
  UnderlineTextStyleKey,
  StrikethroughTextStylePlugin,
  StrikethroughTextStyleKey,
  RichTextLineBoxPlugin,
  ParagraphPlugin,
  TablePlugin,
  TextColorStylePlugin,
  TextColorStyleKey,
  SetDocTextColorCommand,
} from '@searsuite/sear-assembly-doc';
import { SelectionPlugin } from './runtimePlugin/selection/SelectionPlugin';
import { TextInputPlugin } from './runtimePlugin/textInput/TextInputPlugin';

export { CaretPlugin } from './runtimePlugin/caret/CaretPlugin';
export { CompositionPlugin } from './runtimePlugin/composition/CompositionPlugin';
export { DocContentRenderPlugin } from './runtimePlugin/contentRender/DocContentRenderPlugin';
export { DocDebugOverlayPlugin } from './runtimePlugin/debugOverlay/DocDebugOverlayPlugin';
export {
  DocHistorySessionStateDefinition,
  DocHistoryStatusObservation,
  HistoryPlugin,
  RedoDocCommand,
  UndoDocCommand,
  type DocHistoryEntry,
  type DocHistorySessionState,
  type DocHistoryStatus,
} from './runtimePlugin/history/HistoryPlugin';
export {
  FontFamilyTextStylePlugin,
  FontSizeTextStylePlugin,
  BoldTextStylePlugin,
  FontFamilyTextStyleKey,
  FontSizeTextStyleKey,
  BoldTextStyleKey,
  ItalicTextStylePlugin,
  ItalicTextStyleKey,
  UnderlineTextStylePlugin,
  UnderlineTextStyleKey,
  StrikethroughTextStylePlugin,
  StrikethroughTextStyleKey,
  RichTextLineBoxPlugin,
  InsertDocTableCommand,
  ParagraphPlugin,
  SetDocFontFamilyCommand,
  SetDocFontSizeCommand,
  SetDocBoldCommand,
  ToggleDocBoldCommand,
  SetDocItalicCommand,
  ToggleDocItalicCommand,
  SetDocUnderlineCommand,
  ToggleDocUnderlineCommand,
  SetDocStrikethroughCommand,
  SetDocLineSpacingCommand,
  SetDocParagraphSpacingAfterCommand,
  ToggleDocStrikethroughCommand,
  TablePlugin,
  TextColorStylePlugin,
  TextColorStyleKey,
  SetDocTextColorCommand,
  type InsertDocTableInput,
  type SetDocFontFamilyInput,
  type SetDocFontSizeInput,
  type SetDocTextColorInput,
  type SetDocBoldInput,
  type SetDocItalicInput,
  type SetDocUnderlineInput,
  type SetDocStrikethroughInput,
} from '@searsuite/sear-assembly-doc';
export {
  DocSelectionObservation,
  DocSelectionSessionStateDefinition,
  SelectionPlugin,
} from './runtimePlugin/selection/SelectionPlugin';
export { TextInputPlugin } from './runtimePlugin/textInput/TextInputPlugin';

/** Default feature plugins installed by createDocEditor unless overridden. */
export const DefaultDocFeaturePlugins = [
  ParagraphPlugin,
  CompositionPlugin,
  TextInputPlugin,
  SelectionPlugin,
  CaretPlugin,
  DocContentRenderPlugin,
  RichTextLineBoxPlugin,
  FontFamilyTextStylePlugin,
  FontSizeTextStylePlugin,
  BoldTextStylePlugin,
  ItalicTextStylePlugin,
  UnderlineTextStylePlugin,
  StrikethroughTextStylePlugin,
  TextColorStylePlugin,
  TablePlugin,
  HistoryPlugin,
] as const;
