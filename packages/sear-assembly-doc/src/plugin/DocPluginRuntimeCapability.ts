import { type DocCompositionManager } from '@searsuite/sear-assembly-core';
import { type DocCursorPos } from '@searsuite/sear-domain-doc';
import { type KeyboardRouterHandlers, type TextInputHandlers } from '@searsuite/sear-render-input';
import { defineDocRuntimeCapability } from './DocRuntimeExtensionRegistry';

/** Caret-state capability consumed by document plugins. */
export interface DocCaretStateCapability {
  isVisible(): boolean;
  reset(): void;
}

/** Input-binding capability consumed by document plugins. */
export interface DocInputBindingRegistryCapability {
  registerTextHandlers(handlers: TextInputHandlers): () => void;
  registerKeyboardHandlers(handlers: KeyboardRouterHandlers): () => void;
}

/** Pointer input used by document interaction plugins. */
export interface DocPointerInput {
  readonly viewX: number;
  readonly viewY: number;
  preventDefault(): void;
}

/** Document pointer-drag lifecycle consumed by interaction plugins. */
export interface DocPointerDragHandlers {
  onStart(input: DocPointerInput): void;
  onMove(input: DocPointerInput): void;
  onEnd(): void;
}

/** Current document viewport model exposed to interaction plugins. */
export interface DocInteractionViewport {
  readonly width: number;
  readonly height: number;
}

/** Current document content rectangle exposed to interaction plugins. */
export interface DocInteractionContentRect extends DocInteractionViewport {
  readonly x: number;
  readonly y: number;
}

/** View services exposed to document interaction plugins. */
export interface DocInteractionRuntime {
  getRoot(): unknown;
  getViewport(): DocInteractionViewport;
  getContentRect(): DocInteractionContentRect;
  readRootViewOffset(): { x: number; y: number };
  resolveCursorFromPointer(input: DocPointerInput): DocCursorPos;
  subscribePointerDrag(handlers: DocPointerDragHandlers): () => void;
}

/** Runtime extension tokens owned by document plugins assembled by editor composition roots. */
export const DocPluginRuntimeCapability = {
  CaretState: defineDocRuntimeCapability<DocCaretStateCapability>('doc.feature.caretState'),
  Composition: defineDocRuntimeCapability<DocCompositionManager>('doc.feature.composition'),
  InputBindings: defineDocRuntimeCapability<DocInputBindingRegistryCapability>('doc.feature.inputBindings'),
  Interaction: defineDocRuntimeCapability<DocInteractionRuntime>('doc.feature.interaction'),
} as const;
