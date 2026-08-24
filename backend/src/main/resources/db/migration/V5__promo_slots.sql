-- Home-page carousel slides and "Special offers" tiles, moved out of hardcoded
-- frontend arrays so campaign copy can change without a deploy.
--
-- One table for both: they are the same shape wearing different clothes - a
-- headline, a line of copy, a button and somewhere to go. `placement` decides
-- which grid renders it.

CREATE TABLE promo_slots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placement     VARCHAR(20)  NOT NULL,
    title         VARCHAR(180) NOT NULL,
    subtitle      TEXT,
    cta_label     VARCHAR(60),
    -- Internal path only (e.g. /browse?type=Food). Enforced in PromoService:
    -- an admin-editable link on the busiest public page is an open-redirect
    -- vector if arbitrary external URLs are allowed.
    cta_link      VARCHAR(300),
    badge         VARCHAR(30),
    image_url     TEXT,
    image_overlay INTEGER      NOT NULL DEFAULT 40,
    theme         VARCHAR(20)  NOT NULL DEFAULT 'BLUE',
    wide          BOOLEAN      NOT NULL DEFAULT FALSE,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT promo_slots_placement_chk CHECK (placement IN ('CAROUSEL','BENTO')),
    CONSTRAINT promo_slots_theme_chk     CHECK (theme IN ('BLUE','GREEN','PURPLE','DARK','AMBER')),
    CONSTRAINT promo_slots_overlay_chk   CHECK (image_overlay BETWEEN 0 AND 100)
);

-- The public feed query is "active slots for one placement, in order".
CREATE INDEX idx_promo_slots_render ON promo_slots(placement, sort_order)
 WHERE active;

-- Seed exactly what the frontend renders today, so deploying this changes
-- nothing visually and the admin starts from a known-good baseline to edit
-- rather than an empty page they have to fill before the home page works.
INSERT INTO promo_slots (placement, title, subtitle, cta_label, cta_link, theme, sort_order) VALUES
  ('CAROUSEL', 'Welcome to Campus Market',
   'Buy, sell & trade with students you can actually meet.',
   'Explore listings', '/browse', 'BLUE', 0),
  ('CAROUSEL', 'Zero platform fees',
   'Keep 100% of your sale. We only connect you — you trade in person.',
   'Start selling', '/sell', 'GREEN', 1),
  ('CAROUSEL', 'Textbook season',
   'Save up to 70% on used course books from last semester''s students.',
   'Browse books', '/browse?q=textbook', 'PURPLE', 2),
  ('CAROUSEL', 'Need a tutor or a ride?',
   'Services from students, for students. No awkward Venmo guessing.',
   'Find services', '/browse?type=Service', 'DARK', 3);

INSERT INTO promo_slots (placement, title, subtitle, badge, cta_link, theme, wide, sort_order) VALUES
  ('BENTO', 'Just Listed',       'Fresh drops in the last 24h.',        'New', '/browse',               'GREEN',  FALSE, 0),
  ('BENTO', 'Student Services',  'Tutors, movers, designers.',          NULL,  '/browse?type=Service',  'PURPLE', FALSE, 1),
  ('BENTO', 'Meal Deals',        'Home-cooked & campus food near you.', 'Hot', '/browse?type=Food',     'AMBER',  TRUE,  2);
