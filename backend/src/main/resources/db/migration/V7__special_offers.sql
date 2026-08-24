-- Special offers: the admin-curated shelf on the home feed.
--
-- Modelled as two columns on the listing rather than a separate table, because
-- a special offer IS a listing - it has to be viewable, chattable and buyable
-- through exactly the same paths as everything else. A parallel "offers" table
-- would mean a second detail screen, a second checkout, and two places for a
-- price to go stale.

ALTER TABLE listings
    ADD COLUMN special_offer BOOLEAN NOT NULL DEFAULT FALSE;

-- What the item normally goes for, shown struck through next to the live price.
-- Nullable: an offer can be a flat "great price" with nothing to compare to,
-- and inventing a fake original is how storefronts end up lying to people.
ALTER TABLE listings
    ADD COLUMN compare_at_price NUMERIC(12, 2);

-- When it was promoted, so the shelf can lead with the freshest deals rather
-- than whatever happens to sort first.
ALTER TABLE listings
    ADD COLUMN special_offer_at TIMESTAMPTZ;

-- The shelf query is "active, not deleted, special_offer = true", run on every
-- home feed load. Partial index keeps it proportional to the handful of
-- promoted rows instead of the whole catalogue.
CREATE INDEX idx_listings_special_offer
    ON listings (special_offer_at DESC)
    WHERE special_offer = TRUE AND deleted = FALSE;
