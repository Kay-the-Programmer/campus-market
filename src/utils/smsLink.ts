/**
 * Builds the `sms:` link that opens a messaging app with the text ready to
 * send.
 *
 * <p>This is the whole of phone verification on the client: the student taps
 * once, their SMS app opens addressed to our gateway number with the code
 * already typed, and sending it proves they hold the line. Nothing is sent by
 * us, so nothing is billed to us.
 */

/**
 * The separator before `body`, which is not the same on both platforms.
 *
 * <p>Android follows the URI convention and wants `?body=`. iOS does not: it
 * wants `&body=`, with an ampersand where there is no preceding query at all.
 * Get it wrong in either direction and the failure is quiet and bad - the
 * messaging app opens addressed correctly with an empty message, so the
 * student is left looking at a blank text with no idea what to type, and the
 * code is back on the previous screen.
 */
export function smsBodySeparator(ios: boolean): '&' | '?' {
  return ios ? '&' : '?';
}

export interface SmsLinkParts {
  /** The number to text, as the server gave it. */
  to: string;
  /** The message, code included. */
  body: string;
  /** Whether this is an iPhone or iPad - see smsBodySeparator. */
  ios: boolean;
}

export function buildSmsLink({ to, body, ios }: SmsLinkParts): string {
  /* Only digits and a leading +, because a number carrying spaces or dashes
     into an sms: URI is parsed as far as the first one on some Android
     keyboards and quietly addresses the wrong recipient. */
  const trimmed = to.trim();
  const digits = trimmed.replace(/\D/g, '');
  const number = trimmed.startsWith('+') ? `+${digits}` : digits;
  return `sms:${number}${smsBodySeparator(ios)}body=${encodeURIComponent(body)}`;
}
