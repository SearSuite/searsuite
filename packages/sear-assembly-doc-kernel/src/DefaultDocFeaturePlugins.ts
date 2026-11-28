import {
  BoldTextStylePlugin,
  DocNavigationPlugin,
  FontFamilyTextStylePlugin,
  FontSizeTextStylePlugin,
  HistoryPlugin,
  ItalicTextStylePlugin,
  ParagraphPlugin,
  RichTextLineBoxPlugin,
  SelectionPlugin,
  StrikethroughTextStylePlugin,
  TablePlugin,
  TextColorStylePlugin,
  TextInputPlugin,
  UnderlineTextStylePlugin,
} from '@searsuite/sear-assembly-doc';

/** Default document state and semantic command owners. */
export const DefaultDocFeaturePlugins = [
  ParagraphPlugin,
  TextInputPlugin,
  SelectionPlugin,
  DocNavigationPlugin,
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
