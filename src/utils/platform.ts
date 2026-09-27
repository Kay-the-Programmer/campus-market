/**
 * What kind of device and context this is running in.
 *
 * <p>Lives here rather than beside its first caller because two unrelated
 * subsystems need the same answers - push notifications, to explain why an
 * iPhone sees none, and Google sign-in, to choose a flow that works inside an
 * installed app. Importing one from the other would make a cycle through
 * firebase.ts.
 */

/**
 * Is this an iPhone or iPad?
 *
 * <p>The iPad half is not paranoia: since iPadOS 13 an iPad reports itself as
 * "Macintosh" in the user agent and is distinguishable only by the fact that a
 * real Mac has no touch points. Without that clause every iPad is treated as a
 * desktop, told nothing, and silently gets no notifications.
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Running as an installed app rather than inside a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // The media query is the standard; navigator.standalone is Apple's own,
  // predates it, and is still what older iOS actually sets.
  const legacy = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia('(display-mode: standalone)').matches;
}
