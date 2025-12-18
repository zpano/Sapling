import { ALLOW_CONTENTEDITABLE_SELECTORS } from '../config/constants.js';

export function isInAllowedContentEditableRegion(element) {
  if (!element || typeof element.closest !== 'function') return false;
  for (const selector of ALLOW_CONTENTEDITABLE_SELECTORS) {
    if (!selector) continue;
    try {
      if (element.closest(selector)) return true;
    } catch (e) {
      // ignore invalid selector
    }
  }
  return false;
}
