import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGuestSaves, isGuestSaved, toggleGuestSave, takeGuestSaves, clearGuestSaves,
} from './guestSaves';

/**
 * Saves made before there is an account to put them on.
 *
 * <p>The rules worth pinning here are the ones that would lose someone's
 * shortlist or resurrect it after they meant to be rid of it: that the list
 * survives a re-read, that handing it over empties it, and that a shared
 * machine cannot show the next person what the last one saved.
 */

beforeEach(() => {
  localStorage.clear();
  clearGuestSaves();
});

describe('guest saves', () => {
  it('starts empty', () => {
    expect(getGuestSaves()).toEqual([]);
    expect(isGuestSaved('a')).toBe(false);
  });

  it('hearts and un-hearts, reporting which it did', () => {
    expect(toggleGuestSave('a')).toBe(true);
    expect(isGuestSaved('a')).toBe(true);

    expect(toggleGuestSave('a')).toBe(false);
    expect(isGuestSaved('a')).toBe(false);
  });

  it('keeps the newest save first, so the list reads as a shortlist', () => {
    toggleGuestSave('a');
    toggleGuestSave('b');
    toggleGuestSave('c');

    expect(getGuestSaves()).toEqual(['c', 'b', 'a']);
  });

  it('survives being read back from storage', () => {
    toggleGuestSave('a');
    toggleGuestSave('b');

    expect(JSON.parse(localStorage.getItem('cm_guest_saves')!)).toEqual(['b', 'a']);
  });

  it('caps the list rather than growing without bound', () => {
    for (let i = 0; i < 60; i += 1) toggleGuestSave(`l${i}`);

    const saves = getGuestSaves();
    expect(saves).toHaveLength(50);
    // The cap drops the oldest, never the save just made.
    expect(saves[0]).toBe('l59');
    expect(saves).not.toContain('l0');
  });

  it('empties itself when the saves are handed to an account', () => {
    toggleGuestSave('a');
    toggleGuestSave('b');

    expect(takeGuestSaves()).toEqual(['b', 'a']);
    // Not merely read: a second hand-over must not re-save items the person
    // may since have removed from their account.
    expect(getGuestSaves()).toEqual([]);
    expect(takeGuestSaves()).toEqual([]);
  });

  it('shows the next person on a shared machine nothing', () => {
    toggleGuestSave('a');
    takeGuestSaves();

    expect(isGuestSaved('a')).toBe(false);
  });

  it('treats a corrupted value as an empty list rather than throwing', () => {
    localStorage.setItem('cm_guest_saves', '{not json');

    expect(getGuestSaves()).toEqual([]);
    expect(isGuestSaved('a')).toBe(false);
  });

  it('ignores anything in the list that is not an id', () => {
    localStorage.setItem('cm_guest_saves', JSON.stringify(['a', 42, null, 'b']));

    expect(getGuestSaves()).toEqual(['a', 'b']);
  });

  it('keeps working when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new Error('SecurityError'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceeded'); });

    // Private browsing makes even a read throw. Hearting must degrade to
    // doing nothing, never take the feed down with it.
    expect(() => toggleGuestSave('a')).not.toThrow();
    expect(getGuestSaves()).toEqual([]);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
