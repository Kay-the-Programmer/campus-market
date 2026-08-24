-- Adds "Continue with Google" and lets local accounts add/change a phone
-- number without touching anything already stored.

-- A Google-only account has no password to hash - Firebase owns that
-- credential, not us.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL';
ALTER TABLE users ADD CONSTRAINT users_auth_provider_chk CHECK (auth_provider IN ('LOCAL', 'GOOGLE'));

-- Firebase's stable per-account identifier. Nullable because local accounts
-- don't have one; unique so a Google account can only ever map to one user.
ALTER TABLE users ADD COLUMN google_uid VARCHAR(128) UNIQUE;

CREATE INDEX idx_users_google_uid ON users(google_uid) WHERE google_uid IS NOT NULL;
