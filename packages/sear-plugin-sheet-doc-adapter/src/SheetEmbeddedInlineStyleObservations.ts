import { DocInputPlugin, runOutsideCommandExecution } from '@searsuite/sear-assembly-core';
import {
  buildInlineTextRangePatchPlan,
  resolveNode,
  type RichTextInlineStyle,
  type RichTextInlineStyleRegistry,
} from '@searsuite/sear-domain-doc';
import { type ObservationRegistry, type StateObservationSource } from '@searsuite/sear-foundation-subscription';
import {
  SheetEmbeddedInlineStyleObservation,
  type SheetEmbeddedInlineStyleState,
  type SheetEmbeddedInlineStyleStatus,
} from '@searsuite/sear-sheet-editor-contract';

export interface SheetEmbeddedInlineStyleObservationController {
  readonly source: StateObservationSource<SheetEmbeddedInlineStyleState>;
  notify(): void;
}

/** Registers the selection-derived inline-style state with an embedded editor. */
export function registerSheetEmbeddedInlineStyleObservation(
  observations: ObservationRegistry,
  input: DocInputPlugin,
  inlineStyles: RichTextInlineStyleRegistry,
  isEditing: () => boolean,
  readTypingStyle: () => Readonly<Record<string, unknown>> = () => ({}),
): SheetEmbeddedInlineStyleObservationController {
  const controller = createSheetEmbeddedInlineStyleObservationSource(input, inlineStyles, isEditing, readTypingStyle);
  observations.register(SheetEmbeddedInlineStyleObservation, controller.source);
  return controller;
}

function createSheetEmbeddedInlineStyleObservationSource(
  input: DocInputPlugin,
  inlineStyles: RichTextInlineStyleRegistry,
  isEditing: () => boolean,
  readTypingStyle: () => Readonly<Record<string, unknown>>,
): SheetEmbeddedInlineStyleObservationController {
  const read = (): SheetEmbeddedInlineStyleState => {
    if (!isEditing()) return createDisabledSheetEmbeddedInlineStyleState(inlineStyles);
    const { pendingDoc, docSelection } = input.session;
    const patches = buildInlineTextRangePatchPlan(pendingDoc, docSelection, () => ({}));
    const currentNode = resolveNode(pendingDoc, docSelection.head.path);
    const caretStyle = currentNode ? inlineStyles.readTextNodeStyle(currentNode) : undefined;
    const styles = patches.length
      ? patches.map((patch) => inlineStyles.readTextNodeStyle(patch.oldNode))
      : [{ ...caretStyle, ...readTypingStyle() }];
    const state: Record<string, SheetEmbeddedInlineStyleStatus> = {};
    for (const styleKey of inlineStyles.getMutationKeys()) {
      state[styleKey] = readSheetEmbeddedInlineStyleStatus(styles, inlineStyles, styleKey);
    }
    return state;
  };
  const listeners = new Set<(value: SheetEmbeddedInlineStyleState) => void>();
  const notify = (): void => {
    const next = read();
    runOutsideCommandExecution(() => listeners.forEach((listener) => listener(next)));
  };
  const source: StateObservationSource<SheetEmbeddedInlineStyleState> = {
    getSnapshot: read,
    subscribe(listener) {
      let previous = read();
      const publishIfChanged = (): void => {
        const next = read();
        if (sameSheetEmbeddedInlineStyleState(previous, next)) return;
        previous = next;
        listener(next);
      };
      listeners.add(publishIfChanged);
      const disposeDocument = input.subscribeDocument(publishIfChanged);
      const disposeSelection = input.subscribeSelection(publishIfChanged);
      return () => {
        disposeDocument();
        disposeSelection();
        listeners.delete(publishIfChanged);
      };
    },
  };
  return { source, notify };
}

function readSheetEmbeddedInlineStyleStatus(
  styles: readonly (RichTextInlineStyle | undefined)[],
  inlineStyles: RichTextInlineStyleRegistry,
  styleKey: string,
): SheetEmbeddedInlineStyleStatus {
  const enabled = styles.length > 0 && inlineStyles.getMutation(styleKey) !== void 0;
  if (!enabled) return { enabled: false, active: false, value: null };
  const values = styles.map((style) => style?.[styleKey]);
  const first = values[0];
  return {
    enabled,
    active: values.every((value) => value === true),
    value: first !== void 0 && values.every((value) => Object.is(value, first)) ? first : null,
  };
}

function createDisabledSheetEmbeddedInlineStyleState(
  inlineStyles: RichTextInlineStyleRegistry,
): SheetEmbeddedInlineStyleState {
  const state: Record<string, SheetEmbeddedInlineStyleStatus> = {};
  for (const styleKey of inlineStyles.getMutationKeys()) {
    state[styleKey] = { enabled: false, active: false, value: null };
  }
  return state;
}

function sameSheetEmbeddedInlineStyleState(
  left: SheetEmbeddedInlineStyleState,
  right: SheetEmbeddedInlineStyleState,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((styleKey) => {
    const leftStatus = left[styleKey];
    const rightStatus = right[styleKey];
    return rightStatus !== void 0 && sameSheetEmbeddedInlineStyleStatus(leftStatus, rightStatus);
  });
}

function sameSheetEmbeddedInlineStyleStatus(
  left: SheetEmbeddedInlineStyleStatus,
  right: SheetEmbeddedInlineStyleStatus,
): boolean {
  return left.enabled === right.enabled && left.active === right.active && Object.is(left.value, right.value);
}
