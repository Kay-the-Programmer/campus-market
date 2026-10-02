/**
 * Surviving a deploy that happened while the page was open.
 *
 * <p>The app is code-split, so parts of it - the QR card, the admin console -
 * are fetched the first time they are needed rather than up front. The
 * filenames carry a content hash, so every release produces new ones and
 * retires the old.
 *
 * <p>That leaves a window: a tab opened before a release is still running the
 * old main bundle, which asks for a chunk name that no longer exists on the
 * server. vercel.json rewrites everything unmatched to /index.html, so the
 * request does not even fail as a 404 - it succeeds, returning HTML, and the
 * browser refuses to run it as a module. What the user sees is a feature that
 * has stopped working, reporting something like
 * "'text/html' is not a valid JavaScript MIME type".
 *
 * <p>The condition is not an error in the usual sense - nothing is broken, the
 * page is simply out of date - and the fix is always the same: load the page
 * again and get the current filenames.
 */

/**
 * Does this look like a chunk that the server no longer has?
 *
 * <p>Matched on the message because there is nothing else to match on: a failed
 * dynamic import rejects with a plain TypeError, and each engine words it
 * differently. All five phrasings below are the same situation.
 */
export function isStaleChunkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return [
    'failed to fetch dynamically imported module', // Chrome, Edge
    'error loading dynamically imported module', // Firefox
    'importing a module script failed', // Safari
    'is not a valid javascript mime type', // any, when the rewrite returns HTML
    "unexpected token '<'", // older engines parsing that HTML
  ].some((phrase) => message.toLowerCase().includes(phrase));
}

/** Per tab, so closing it clears the record; survives the reload itself. */
const RELOAD_KEY = 'cm_chunk_reloaded_at';
/** Long enough that a reload cannot loop, short enough to retry a later release. */
const RELOAD_COOLDOWN_MS = 30_000;

function lastReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    // Private mode, or storage blocked. Treated as "never reloaded", which
    // risks one extra reload and never a loop, because the reload itself only
    // happens when a chunk is genuinely missing.
    return 0;
  }
}

/**
 * Reload to pick up the current build.
 *
 * @returns false when a reload was attempted too recently, in which case the
 *          caller should surface an error rather than try again - a reload that
 *          does not fix the problem must not become a loop.
 */
export function reloadForNewBuild(): boolean {
  const now = Date.now();
  if (now - lastReloadAt() < RELOAD_COOLDOWN_MS) {
    return false;
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Unstorable; the cooldown is lost but the reload below still helps once.
  }
  window.location.reload();
  return true;
}

/**
 * A dynamic import that reloads the page once if the chunk has been retired.
 *
 * <p>For places where there is nothing on screen worth preserving - a route
 * that has not rendered yet. Where the user is part-way through something,
 * prefer {@link isStaleChunkError} and offer them the reload instead of taking
 * it.
 */
export async function importChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (isStaleChunkError(err) && reloadForNewBuild()) {
      // The reload is in flight; this promise is never going to settle usefully.
      await new Promise<never>(() => {});
    }
    throw err;
  }
}
