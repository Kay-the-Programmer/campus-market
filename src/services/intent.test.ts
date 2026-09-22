import { beforeEach, describe, expect, it } from 'vitest';
import { getIntent, setIntent, clearIntent, mergeGuestIntent } from './intent';

/**
 * The first-run question is only worth asking if it is asked once.
 *
 * <p>These pin the rules that decide that: that declining is remembered as
 * firmly as choosing, that a shared machine does not open with the last
 * person's answer, and that signing up does not re-ask something answered two
 * minutes earlier as a guest.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('intent', () => {
  it('has no answer until one is given', () => {
    expect(getIntent('u1')).toBeNull();
  });

  it('remembers a choice', () => {
    setIntent('u1', 'Food');
    expect(getIntent('u1')).toBe('Food');
  });

  it('remembers a refusal just as firmly', () => {
    setIntent('u1', 'browsing');

    // "browsing" must not read back as null, or the question returns on the
    // next visit and a helpful prompt becomes nagging.
    expect(getIntent('u1')).toBe('browsing');
  });

  it('keeps one person\'s answer away from another', () => {
    setIntent('u1', 'Service');
    expect(getIntent('u2')).toBeNull();
  });

  it('treats a guest as their own person', () => {
    setIntent('guest', 'Product');
    expect(getIntent('')).toBe('Product');
    expect(getIntent('u1')).toBeNull();
  });

  it('ignores a stored value that is not an answer', () => {
    localStorage.setItem('cm_intent:u1', 'Bicycles');
    expect(getIntent('u1')).toBeNull();
  });

  it('carries a guest answer onto a new account', () => {
    setIntent('guest', 'Food');
    mergeGuestIntent('u1');

    expect(getIntent('u1')).toBe('Food');
    // Cleared, so the next person on a shared machine is asked fresh.
    expect(getIntent('guest')).toBeNull();
  });

  it('does not overwrite an answer the account already had', () => {
    setIntent('u1', 'Service');
    setIntent('guest', 'Food');
    mergeGuestIntent('u1');

    expect(getIntent('u1')).toBe('Service');
    expect(getIntent('guest')).toBeNull();
  });

  it('clears the guest bucket even when there is nothing to carry', () => {
    setIntent('guest', 'browsing');
    setIntent('u1', 'Product');
    mergeGuestIntent('u1');

    expect(getIntent('guest')).toBeNull();
  });

  it('can be forgotten', () => {
    setIntent('u1', 'Food');
    clearIntent('u1');
    expect(getIntent('u1')).toBeNull();
  });
});
