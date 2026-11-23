import { HeadlessKeyboardRouter, HeadlessPointerCapture, HeadlessTextInput } from '@searsuite/sear-render-input';

import { SheetInputAdapterLifecycle } from '../src/sheet/SheetInputAdapterLifecycle';

describe('SheetInputAdapterLifecycle', () => {
  it('releases text, keyboard, and pointer-capture listeners on destroy', () => {
    const textInput = new HeadlessTextInput();
    const keyboardRouter = new HeadlessKeyboardRouter();
    const pointerCapture = new HeadlessPointerCapture();
    const stopText = jest.spyOn(textInput, 'stopListener');
    const stopPointerCapture = jest.spyOn(pointerCapture, 'stop');
    const stopKeyboard = jest.spyOn(keyboardRouter, 'stopListener');
    const startKeyboard = jest.spyOn(keyboardRouter, 'startListener');
    const lifecycle = new SheetInputAdapterLifecycle(textInput, keyboardRouter, pointerCapture);

    lifecycle.start({} as never);
    expect(startKeyboard).toHaveBeenCalledTimes(1);
    lifecycle.destroy();

    expect(stopText).toHaveBeenCalledTimes(1);
    expect(stopPointerCapture).toHaveBeenCalledTimes(1);
    expect(stopKeyboard).toHaveBeenCalledTimes(1);
  });
});
