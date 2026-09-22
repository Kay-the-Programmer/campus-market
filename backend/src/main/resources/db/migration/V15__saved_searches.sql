-- "Tell me when one is listed."
--
-- The single most common dead end on a marketplace this size is a search that
-- genuinely has no answer yet - the campus has no spare monitor today, and
-- will have three next week. Until now that returned an empty grid and the
-- person left, with nothing tying them to the moment the item appears.
--
-- The notification machinery already exists: SavedListingNotifier delivers
-- price drops on saved listings, NotificationType already has SAVED_UPDATE,
-- and the preferences screen already has a switch for it. What was missing was
-- a record of what someone is waiting FOR.
--
-- Stored as the query itself rather than a snapshot of its results, because
-- the interesting case is the listing that does not exist yet.
CREATE TABLE saved_searches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    -- The free-text term. Nullable so "anything new in Textbooks under K200"
    -- is expressible - a saved search is a set of filters, and the words are
    -- only one of them.
    query        TEXT        NULL,

    -- The same filters browse already understands, so matching a new listing
    -- against a saved search reuses the rules rather than inventing a second,
    -- subtly different interpretation of what "under K200" means.
    type         TEXT        NULL,
    category_id  UUID        NULL REFERENCES categories (id) ON DELETE CASCADE,
    campus_zone  TEXT        NULL,
    min_price    NUMERIC(12, 2) NULL,
    max_price    NUMERIC(12, 2) NULL,

    -- What the person called it, shown in their list. Derived from the filters
    -- when they do not name it themselves.
    label        TEXT        NOT NULL,

    -- Switched off rather than deleted when someone stops wanting the alerts,
    -- so the search itself stays in their list to re-run by hand.
    notify       BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- When a matching listing last triggered a notification. Used to rate-limit
    -- per search: a flood of five alerts in a minute is how someone turns
    -- notifications off entirely, which loses every future alert too.
    last_notified_at TIMESTAMPTZ NULL
);

-- Every new listing is matched against every active saved search, so this is
-- read on the write path. Partial, because a search with alerts off is not a
-- candidate and there is no reason to walk past it.
CREATE INDEX idx_saved_searches_notify
    ON saved_searches (notify)
    WHERE notify = TRUE;

-- The person's own list, newest first.
CREATE INDEX idx_saved_searches_user
    ON saved_searches (user_id, created_at DESC);

-- One saved search per distinct set of filters per person. Saving the same
-- thing twice is a mis-tap, and the cost of allowing it is two identical
-- notifications for one new listing. COALESCE rather than the raw columns
-- because NULLs are distinct in a unique index, which would let "anything in
-- Textbooks" be saved any number of times.
CREATE UNIQUE INDEX idx_saved_searches_dedupe
    ON saved_searches (
        user_id,
        COALESCE(lower(query), ''),
        COALESCE(type, ''),
        COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(campus_zone, ''),
        COALESCE(min_price, -1),
        COALESCE(max_price, -1)
    );
