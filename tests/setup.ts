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

