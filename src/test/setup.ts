import '@testing-library/jest-dom/vitest';

/*
 * jsdom implements no ResizeObserver, so any component that measures itself
 * throws on mount under test while working perfectly in a browser. A stub
 * that records nothing is enough: the tests here assert rendered output, not
 * observed geometry, and the production code already treats the observer as
 * optional.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
