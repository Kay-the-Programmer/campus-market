-- Email: a second delivery channel for notifications, and admin-composed
-- campaigns.
--
-- Two separate consents, deliberately kept apart. `email_enabled` covers mail
-- a user's own activity produced - their order moved, someone messaged them.
-- `marketing_emails` covers mail nobody asked for individually. Collapsing the
-- two would mean switching off campaign mail also switched off the receipt for
-- something you just bought, and the person who wanted the first would be
-- surprised by losing the second.

-- --------------------------------------------------------------- preferences
ALTER TABLE notification_preferences
    -- Master switch for the email channel, mirroring push_enabled. The
    -- per-category columns already on this table (messages, orders, reviews,
    -- price_drops, system_updates) are about *what* a user cares about and are
    -- shared by both channels; these two are about *how* it reaches them.
    ADD COLUMN email_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Campaign consent. Defaults TRUE, which is a decision rather than an
    -- oversight: these are people who signed up to the marketplace, and an
    -- announcement about it is what CAN-SPAM and most comparable regimes treat
    -- as permissible to an existing customer provided every message carries a
    -- working one-click unsubscribe - which EmailCampaignService guarantees.
    --
    -- Under GDPR-style rules that require prior opt-in, change this default to
    -- FALSE and let users opt in from notification settings. It is one word
    -- here and one in NotificationPreference; nothing else in the send path
    -- assumes either answer.
    ADD COLUMN marketing_emails BOOLEAN NOT NULL DEFAULT TRUE,

    -- Capability URL for unsubscribing without signing in. A mail client
    -- following List-Unsubscribe has no session, and demanding a login before
    -- honouring an opt-out is both hostile and, in several jurisdictions, not
    -- compliant. Random, per-user, and it grants exactly one thing: turning
    -- this user's marketing flag off.
    ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX idx_notification_prefs_unsubscribe_token
    ON notification_preferences (unsubscribe_token);

/*
 * Backfill.
 *
 * Preference rows are created lazily - no row means "all defaults" - so most
 * users have none, and a campaign that only looked at this table would reach
 * almost nobody. Rather than teach the recipient query about absent rows and
 * their implied defaults, every existing user gets a real row now. From here
 * on the row exists, so "who consented" is a plain WHERE clause.
 */
INSERT INTO notification_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------------- campaigns
CREATE TABLE email_campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject          TEXT        NOT NULL,
    -- Plain text, authored by an admin. Rendered into the HTML shell at send
    -- time and also sent as the text/plain alternative, so there is one source
    -- of truth for the words and no HTML to sanitise on the way in.
    body             TEXT        NOT NULL,
    -- Which users to send to. See EmailCampaign.Audience.
    audience         VARCHAR(32) NOT NULL,
    status           VARCHAR(16) NOT NULL DEFAULT 'DRAFT',

    -- Counted rather than joined to a per-recipient table. A campus-sized
    -- audience sends in one pass in well under a minute, and per-recipient
    -- rows would be a table that only ever grows to answer a question nobody
    -- has asked yet. The trade-off is real and worth stating: a crash
    -- mid-send leaves the row SENDING with partial counts and no way to
    -- resume, so it has to be judged by hand from the log.
    recipient_count  INTEGER     NOT NULL DEFAULT 0,
    sent_count       INTEGER     NOT NULL DEFAULT 0,
    failed_count     INTEGER     NOT NULL DEFAULT 0,
    error            TEXT,

    -- SET NULL, not CASCADE: deleting the admin who sent a campaign must not
    -- delete the record that it was sent.
    created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at          TIMESTAMPTZ
);

CREATE INDEX idx_email_campaigns_created_at ON email_campaigns (created_at DESC);
