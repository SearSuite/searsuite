/**
 * Keyboard, pointer, text-input, and composition routing contracts.
 *
 * @packageDocumentation
 */

export { InputManager } from './InputManager';
export { Input } from './Input';

export { TextInput } from './TextInput';
export { TextInputKind, type TextInputEvent, type TextInputHandlers } from './TextInputEvent';
export { HeadlessTextInput } from './HeadlessTextInput';

export { KeyboardRouter, type KeyboardRouterHandlers } from './KeyboardRouter';
export { HeadlessKeyboardRouter } from './HeadlessKeyboardRouter';

export { PointerCapture, type PointerCaptureHandlers, type PointerCapturePoint } from './PointerCapture';
export { HeadlessPointerCapture } from './HeadlessPointerCapture';
