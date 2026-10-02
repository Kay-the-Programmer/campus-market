import { describe, expect, it } from 'vitest';
import { buildSmsLink, smsBodySeparator } from './smsLink';

/*
 * The separator is the only part of this that is easy to get wrong and hard to
 * notice: both forms open the messaging app, and the wrong one opens it with
 * an empty message. The student is then staring at a blank text with the code
 * on the screen they just left.
 */
describe('buildSmsLink', () => {
  it('uses ?body= on Android', () => {
    expect(buildSmsLink({ to: '+260971234567', body: 'CampusMarket 483920', ios: false }))
      .toBe('sms:+260971234567?body=CampusMarket%20483920');
  });

  it('uses &body= on iOS, which does not accept the query form', () => {
    expect(buildSmsLink({ to: '+260971234567', body: 'CampusMarket 483920', ios: true }))
      .toBe('sms:+260971234567&body=CampusMarket%20483920');
  });

  it('strips the spacing people read numbers in', () => {
    // Addressed to the wrong recipient otherwise, on keyboards that stop
    // parsing the number at the first space.
    expect(buildSmsLink({ to: '+260 97 123 4567', body: 'x', ios: false }))
      .toBe('sms:+260971234567?body=x');
  });

  it('keeps a local number local rather than inventing a country code', () => {
    expect(buildSmsLink({ to: '0971234567', body: 'x', ios: false }))
      .toBe('sms:0971234567?body=x');
  });

  it('escapes the message so a code is never truncated', () => {
    expect(buildSmsLink({ to: '0971234567', body: 'Campus & Market 1', ios: false }))
      .toContain('body=Campus%20%26%20Market%201');
  });

  it('names both separators explicitly', () => {
    expect(smsBodySeparator(true)).toBe('&');
    expect(smsBodySeparator(false)).toBe('?');
  });
});
