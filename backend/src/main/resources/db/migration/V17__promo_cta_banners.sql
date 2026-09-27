-- Call-to-action banners on the browse pages.
--
-- A third placement rather than a third table: a CTA banner is the same record
-- the carousel and the tiles already are - a headline, a line of copy, a button
-- and somewhere to go - so it inherits the editor, the service, the audit trail
-- and the colour overrides for free. What is new is the picture collage beside
-- the copy, which is the only part of the shape the other two placements have
-- no use for.

ALTER TABLE promo_slots DROP CONSTRAINT IF EXISTS promo_slots_placement_chk;
ALTER TABLE promo_slots ADD CONSTRAINT promo_slots_placement_chk
    CHECK (placement IN ('CAROUSEL', 'BENTO', 'CTA_BANNER'));

-- The collage: a handful of small pictures stacked at varying heights beside
-- the copy. A child table rather than a delimited column because these are a
-- list whose order is meaningful - the first image is drawn largest and the
-- last is the first one dropped on a narrow screen - and because every other
-- image collection in this schema (listing_images) is modelled the same way.
--
-- `position` is part of the key, not just an ordering hint: Hibernate's
-- @OrderColumn rewrites the whole list on save, so there is exactly one row per
-- slot per position and duplicates would be a bug rather than a shape the data
-- is allowed to take.
CREATE TABLE promo_slot_images (
    promo_id UUID    NOT NULL REFERENCES promo_slots(id) ON DELETE CASCADE,
    url      TEXT    NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (promo_id, position)
);

-- Seed the two the browse pages render, so the feature arrives working rather
-- than as an empty section an admin has to discover and fill. Both are pure
-- copy - no collage - which is the state the layout has to look deliberate in
-- anyway, since an admin adding a banner starts there.
INSERT INTO promo_slots (placement, title, subtitle, cta_label, cta_link, theme, sort_order) VALUES
  ('CTA_BANNER', 'Sell what you''re not using.',
   'List it in under a minute. Zero platform fees — you keep every kwacha.',
   'Start selling', '/sell', 'PURPLE', 0),
  ('CTA_BANNER', 'Deals from students near you.',
   'Textbooks, gadgets and home-cooked meals, marked down every day.',
   'See the deals', '/browse?deals=1', 'BLUE', 1);
