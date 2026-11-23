import { DocInputPlugin } from '@searsuite/sear-assembly-core';
import {
  buildInlineTextRangePatchPlan,
  type RichTextInlineStyleRegistry,
  type RichTextInlineStyle,
} from '@searsuite/sear-domain-doc';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

/** Whether one inline style can be applied, is active, and has a common selected value. */
export interface DocInlineStyleStatus {
  readonly enabled: boolean;
  readonly active: boolean;
  /** The common selected value, or null when unset or mixed. */
  readonly value: unknown | null;
}

/** Inline style state consumed by document toolbars and other host controls. */
export type DocInlineStyleState = Readonly<Record<string, DocInlineStyleStatus>>;

/** Current inline-style availability and activation for the document selection. */
export const DocInlineStyleObservation = defineStateObservation<DocInlineStyleState>('doc.inlineStyles');

/** Registers the selection-derived inline-style state with the editor observation registry. */
export function registerDocInlineStyleObservation(
  observations: ObservationRegistry,
  input: DocInputPlugin,
  inlineStyles: RichTextInlineStyleRegistry,
): void {
  observations.register(DocInlineStyleObservation, createDocInlineStyleObservationSource(input, inlineStyles));
}

function createDocInlineStyleObservationSource(
  input: DocInputPlugin,
  inlineStyles: RichTextInlineStyleRegistry,
): {
  getSnapshot(): DocInlineStyleState;
  subscribe(listener: (value: DocInlineStyleState) => void): () => void;
} {
  const read = (): DocInlineStyleState => readDocInlineStyleState(input, inlineStyles);
  return {
    getSnapshot: read,
    subscribe(listener) {
      let previous = read();
      const publishIfChanged = (): void => {
        const next = read();
        if (sameDocInlineStyleState(previous, next)) return;
        previous = next;
        listener(next);
      };
      const disposeDocument = input.subscribeDocument(publishIfChanged);
      const disposeSelection = input.subscribeSelection(publishIfChanged);
      return () => {
        disposeDocument();
        disposeSelection();
      };
    },
  };
}

function readDocInlineStyleState(
  input: DocInputPlugin,
  inlineStyles: RichTextInlineStyleRegistry,
): DocInlineStyleState {
  const { pendingDoc, docSelection } = input.session;
  const patches = buildInlineTextRangePatchPlan(pendingDoc, docSelection, () => ({}));
  const styles = patches.map((patch) => inlineStyles.readTextNodeStyle(patch.oldNode));
  const state: Record<string, DocInlineStyleStatus> = {};
  for (const styleKey of inlineStyles.getMutationKeys()) {
    state[styleKey] = readDocInlineStyleStatus(styles, inlineStyles, styleKey);
  }
  return state;
}

function readDocInlineStyleStatus(
  styles: readonly (RichTextInlineStyle | undefined)[],
  inlineStyles: RichTextInlineStyleRegistry,
  styleKey: string,
): DocInlineStyleStatus {
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

function sameDocInlineStyleState(left: DocInlineStyleState, right: DocInlineStyleState): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((styleKey) => {
    const leftStatus = left[styleKey];
    const rightStatus = right[styleKey];
    return rightStatus !== void 0 && sameDocInlineStyleStatus(leftStatus, rightStatus);
  });
}

function sameDocInlineStyleStatus(left: DocInlineStyleStatus, right: DocInlineStyleStatus): boolean {
  return left.enabled === right.enabled && left.active === right.active && Object.is(left.value, right.value);
}
