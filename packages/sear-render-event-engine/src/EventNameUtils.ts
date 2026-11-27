import { PlatformEventName } from '@searsuite/sear-foundation-platform';

const EVENT_NAME_MAP: Record<string, string> = {
  [PlatformEventName.Click]: PlatformEventName.Click,
  dblclick: 'dblClick',
  dblClick: 'dblClick',
  mousedown: 'mouseDown',
  mouseDown: 'mouseDown',
  mouseup: 'mouseUp',
  mouseUp: 'mouseUp',
  mousemove: 'mouseMove',
  mouseMove: 'mouseMove',
  mouseenter: 'mouseEnter',
  mouseEnter: 'mouseEnter',
  mouseleave: 'mouseLeave',
  mouseLeave: 'mouseLeave',
  mouseover: 'mouseOver',
  mouseOver: 'mouseOver',
  mouseout: 'mouseOut',
  mouseOut: 'mouseOut',
  contextmenu: 'contextMenu',
  contextMenu: 'contextMenu',
  keydown: 'keyDown',
  keyDown: 'keyDown',
  keyup: 'keyUp',
  keyUp: 'keyUp',
  keypress: 'keyPress',
  keyPress: 'keyPress',
  scroll: 'scroll',
};

/**
 * Normalizes an event key (whether lowercased like `mousedown` or camelCased like `mouseDown`)
 * to its canonical engine identifier (`mouseDown`).
 */
export function normalizeEventKey(eventKey: string): string {
  const lower = eventKey.toLowerCase();
  return EVENT_NAME_MAP[eventKey] ?? EVENT_NAME_MAP[lower] ?? eventKey;
}

/**
 * Derives the plugin handler method name for a given event key.
 * e.g. `mousedown` / `mouseDown` → `onMouseDown`
 */
export function getViewHandlerName(eventKey: string): string {
  const normalized = normalizeEventKey(eventKey);
  return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}
