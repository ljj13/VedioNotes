import '@testing-library/jest-dom/vitest';

// HeroUI ScrollShadow and other components rely on ResizeObserver, which is
// not available in the jsdom test environment.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

// react-aria useFocusVisible attempts to assign `target.focus` on focus events.
// In jsdom, HTMLElement.prototype.focus is defined as a read-only property on
// the instance, causing "Cannot set property focus of [object HTMLElement]
// which has only a getter". Patch it to be a writable no-op function so the
// assignment in react-aria succeeds without throwing.
// react-aria useFocusVisible attempts to assign `target.focus` on focus events.
// In jsdom, HTMLElement.prototype.focus may be read-only in some contexts.
// Patch it to be writable so the assignment in react-aria succeeds.
if (typeof HTMLElement !== 'undefined') {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  try {
    Object.defineProperty(proto, 'focus', {
      configurable: true,
      writable: true,
      value: proto.focus ?? function focus() {},
    });
  } catch {
    // If the property cannot be redefined, swallow — tests may still work.
  }
}

// react-aria SharedElementTransition calls element.getAnimations() during
// layout effects. jsdom does not implement the Web Animations API, causing
// "element.getAnimations is not a function". Provide a no-op stub.
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function getAnimations() {
    return [];
  };
}

