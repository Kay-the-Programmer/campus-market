-- Phone verification by one-time code.
--
-- A phone number is how two students actually find each other at handover, so
-- an unverified one is worse than none: it looks like a way to reach someone
-- and isn't. These columns back a short-lived code sent to the number and
-- checked before the number is trusted.

ALTER TABLE users
    ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- The code is stored hashed, like a password. A leaked database row should not
-- hand someone a working code for a number they do not own.
ALTER TABLE users
    ADD COLUMN phone_otp_hash VARCHAR(255);

ALTER TABLE users
    ADD COLUMN phone_otp_expires_at TIMESTAMPTZ;

-- Attempts are counted so a six-digit code cannot be walked through by brute
-- force; the code is discarded once this passes its limit.
ALTER TABLE users
    ADD COLUMN phone_otp_attempts INT NOT NULL DEFAULT 0;

-- When the last code was issued, so re-sends can be throttled.
ALTER TABLE users
    ADD COLUMN phone_otp_sent_at TIMESTAMPTZ;

-- The number the pending code was sent to. Kept separate from `phone` so an
-- unverified edit cannot overwrite a number that is already confirmed - the
-- new one only lands once its code checks out.
ALTER TABLE users
    ADD COLUMN phone_pending VARCHAR(32);

-- Existing accounts keep their number but start unverified: nobody has proved
-- one yet, and marking them verified would be a claim the data cannot support.
