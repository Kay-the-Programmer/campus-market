import React, { useEffect, useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface AvatarProps {
  /** Profile photo URL. Missing, empty and broken are all handled the same. */
  src?: string | null;
  /** Used for the initials and, unless `alt` says otherwise, the alt text. */
  name?: string;
  /**
   * Size, shape and ring classes. Applied to the photo AND to the fallback,
   * so a face and a set of initials occupy exactly the same box - otherwise a
   * thread list reflows depending on who has uploaded a picture.
   *
   * <p>Include the corner radius here. It is not defaulted, because two
   * utilities for the same property (a built-in rounded-full and a caller's
   * rounded-2xl) are resolved by stylesheet order rather than by the order
   * they are written in, so the loser is whichever Tailwind emitted second -
   * and the listing page's seller square would sometimes be a circle.
   */
  className?: string;
  /** Initials are drawn at wildly different sizes, from 9px rows to 112px heroes. */
  textClassName?: string;
  /** Decorative next to a name that is already on screen: pass "". */
  alt?: string;
}

/**
 * Up to two initials, which is as many as fit in a circle at list-row size.
 *
 * <p>Takes the first and last word so "Mary Jane Watson" reads MW rather than
 * MJ - the surname is the half people recognise.
 */
function initialsOf(name?: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/**
 * Somebody's profile picture, with something to show when there isn't one.
 *
 * <p>Every avatar in the app draws through this. Before it, the nav had a
 * fallback and the places you actually look at people did not: Messages, the
 * profile page, a listing's seller and the reviews all rendered a bare
 * {@code <img>} at whatever the server sent. An account with no photo - which
 * every Google account that never set one is - got an empty box there, and a
 * photo that failed to load got the browser's broken-image glyph, in both
 * cases next to a name that made it obvious something should have been there.
 *
 * <p>Three cases, one appearance:
 *
 * <ul>
 *   <li><b>No URL.</b> Initials, or a generic figure when we do not even have
 *       a name to take them from.</li>
 *   <li><b>A URL that fails.</b> Same fallback, on the error event, rather
 *       than a broken icon. This is the common one: these are Google account
 *       photos, and Google expires and rate-limits those URLs.</li>
 *   <li><b>A URL that works.</b> The photo, cropped square, in the same box.</li>
 * </ul>
 */
export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  className = 'w-8 h-8 rounded-full',
  textClassName = 'text-xs',
  alt,
}) => {
  const [failed, setFailed] = useState(false);

  /* A new src deserves its own attempt - otherwise switching chat threads
     leaves the next person's photo suppressed by the last one's failure. */
  useEffect(() => setFailed(false), [src]);

  const initials = initialsOf(name);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-[#dbe1ff] text-[#2563eb] flex items-center justify-center font-bold shrink-0 select-none ${textClassName}`}
        /* The name is already beside every one of these, so the fallback is
           decoration rather than information worth announcing twice. */
        aria-hidden="true"
      >
        {initials || <UserIcon className="w-1/2 h-1/2" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? name ?? ''}
      onError={() => setFailed(true)}
      /*
       * Google serves these from lh3.googleusercontent.com and answers 403 to
       * some requests that carry a Referer, which shows up as avatars that
       * load for one person and not another on the same page. Sending none
       * costs nothing here - it is a public image on a CDN.
       */
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={`${className} object-cover bg-[#e5eeff] shrink-0`}
    />
  );
};
