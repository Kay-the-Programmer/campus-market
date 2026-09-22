-- Trending: what the campus is looking at NOW, not ever.
--
-- `listings.views_count` already existed and is still the lifetime total the
-- seller sees on their dashboard. It cannot answer "what is hot this week",
-- because a counter has no memory of when it was incremented: a listing posted
-- in September with 400 views outranks today's hottest item permanently, and
-- gets more wrong every week it stays up. That is what "Most popular" was
-- sorting by.
--
-- So views get a timestamp. One row per view, which is the only shape that can
-- answer a question about a window without deciding the window up front - the
-- home row uses 7 days today, and changing that later is a query edit rather
-- than a migration and a backfill that cannot be done.
--
-- The cost is a row per listing open. On a single-campus marketplace that is
-- small, and the index below keeps the trending query proportional to the
-- window rather than to the table.
CREATE TABLE listing_views (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,

    -- Null for a guest. Guests are most of the traffic on a public catalogue,
    -- so excluding them would measure the signed-in minority and call it the
    -- campus. Kept only to de-duplicate (see below), never shown to anyone.
    viewer_id   UUID        NULL REFERENCES users (id) ON DELETE SET NULL,

    -- Coarse per-day bucket, used solely as the de-duplication key. Storing the
    -- day alongside the instant costs one date and saves the alternative: a
    -- functional unique index that every insert has to match exactly.
    viewed_on   DATE        NOT NULL DEFAULT CURRENT_DATE,
    viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One view per person per listing per day.
--
-- Without this, trending measures refreshing. A seller reloading their own page
-- - or anyone leaving a tab open that reconnects - would climb the row, and the
-- first thing everyone would learn is that the way to get promoted is to press
-- F5. A day is the right granularity: coming back tomorrow is genuine renewed
-- interest, coming back in ten seconds is not.
--
-- Guests share a single NULL viewer_id, and Postgres treats NULLs as distinct
-- in a unique index, so this constrains signed-in viewers only. Guest views are
-- therefore counted more than once - accepted deliberately: the alternative is
-- fingerprinting people who have not signed in, to slightly improve the
-- ordering of a shelf.
CREATE UNIQUE INDEX idx_listing_views_dedupe
    ON listing_views (listing_id, viewer_id, viewed_on)
    WHERE viewer_id IS NOT NULL;

-- The trending query is "views since <cutoff>, grouped by listing". Leading
-- with viewed_at lets the window be range-scanned and the listing ids come out
-- of the index without touching the table.
CREATE INDEX idx_listing_views_window
    ON listing_views (viewed_at DESC, listing_id);
