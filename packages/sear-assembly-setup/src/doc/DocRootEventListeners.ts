import { Platform, PlatformEventName } from '@searsuite/sear-foundation-platform';
import { type DocPointerDragHandlers, type DocPointerInput } from './DocInteractionRuntime';

/** Adds a root event listener and returns its disposer. */
export function addRootListener(
  platform: Platform,
  root: unknown,
  type: (typeof PlatformEventName)[keyof typeof PlatformEventName],
  listener: (event: unknown) => void,
): () => void {
  return platform.addEventListener(root, type, listener);
}

/** Binds platform pointer-drag events for document interaction runtimes. */
export function addDocPointerDragListeners(
  platform: Platform,
  root: unknown,
  handlers: DocPointerDragHandlers,
): () => void {
  const disposers = [
    addRootListener(platform, root, PlatformEventName.MouseDown, function handleDocPointerDragStart(event): void {
      const pointer = readDocPointerInput(event);
      if (pointer) handlers.onStart(pointer);
    }),
    addRootListener(platform, root, PlatformEventName.MouseMove, function handleDocPointerDragMove(event): void {
      const pointer = readDocPointerInput(event);
      if (pointer) handlers.onMove(pointer);
    }),
    addRootListener(platform, root, PlatformEventName.MouseUp, function handleDocPointerDragEnd(): void {
      handlers.onEnd();
    }),
  ];
  return function disposeDocPointerDragListeners(): void {
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
}

function readDocPointerInput(event: unknown): DocPointerInput | null {
  if (typeof event !== 'object' || event === null) return null;
  const value = event as { clientX?: unknown; clientY?: unknown; preventDefault?: unknown };
  if (typeof value.clientX !== 'number' || typeof value.clientY !== 'number') return null;
  return {
    viewX: value.clientX,
    viewY: value.clientY,
    preventDefault: typeof value.preventDefault === 'function' ? value.preventDefault.bind(event) : noopPreventDefault,
  };
}

function noopPreventDefault(): void {
  return void 0;
}
