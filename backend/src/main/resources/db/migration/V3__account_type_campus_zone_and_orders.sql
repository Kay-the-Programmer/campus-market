-- Three related additions:
--   1. account_type  - buyer vs seller, chosen at registration, gates listing
--                      creation. Upgradable in place, so it is intent, not caste.
--   2. campus_zone   - a fixed three-way zone on both users and listings,
--                      replacing free-text location for matching purposes.
--   3. orders        - buyer-initiated purchase requests, which the marketplace
--                      previously had no representation for at all.

-- ------------------------------------------------------------------ users
-- Existing accounts become SELLER, not BUYER. They signed up when listing was
-- unrestricted, and several already have live listings; defaulting them to
-- BUYER would retroactively lock those people out of their own inventory.
ALTER TABLE users ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT 'SELLER';
ALTER TABLE users ADD CONSTRAINT users_account_type_chk
    CHECK (account_type IN ('BUYER','SELLER'));

-- New signups pick explicitly; the column default only covers the backfill
-- above, so drop it now that the existing rows are settled.
ALTER TABLE users ALTER COLUMN account_type DROP DEFAULT;

-- Nullable: pre-existing accounts never chose a zone, and guessing one for
-- them would put wrong data in front of buyers. They are prompted on next login.
ALTER TABLE users ADD COLUMN campus_zone VARCHAR(20);
ALTER TABLE users ADD CONSTRAINT users_campus_zone_chk
    CHECK (campus_zone IS NULL OR campus_zone IN ('DOWNSCHOOL','UPSCHOOL','ACROSS'));

CREATE INDEX idx_users_campus_zone ON users(campus_zone) WHERE campus_zone IS NOT NULL;

-- --------------------------------------------------------------- listings
ALTER TABLE listings ADD COLUMN campus_zone VARCHAR(20);
ALTER TABLE listings ADD CONSTRAINT listings_campus_zone_chk
    CHECK (campus_zone IS NULL OR campus_zone IN ('DOWNSCHOOL','UPSCHOOL','ACROSS'));

CREATE INDEX idx_listings_campus_zone ON listings(campus_zone) WHERE campus_zone IS NOT NULL;

-- ----------------------------------------------------------------- orders
-- One order per seller per checkout: each seller accepts their own half
-- independently, so a cart spanning three sellers writes three orders.
CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference     VARCHAR(20)   NOT NULL UNIQUE,
    buyer_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    total         NUMERIC(12,2) NOT NULL DEFAULT 0,
    meetup_zone   VARCHAR(20),
    buyer_note    TEXT,
    seller_note   TEXT,
    responded_at  TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT orders_status_chk
        CHECK (status IN ('PENDING','ACCEPTED','DECLINED','COMPLETED','CANCELLED')),
    CONSTRAINT orders_meetup_zone_chk
        CHECK (meetup_zone IS NULL OR meetup_zone IN ('DOWNSCHOOL','UPSCHOOL','ACROSS')),
    -- Nobody orders from themselves; a violation here means a bug upstream.
    CONSTRAINT orders_distinct_parties_chk CHECK (buyer_id <> seller_id)
);

-- The seller's inbox query is "my open orders, newest first" - this covers it.
CREATE INDEX idx_orders_seller_status ON orders(seller_id, status, created_at DESC);
CREATE INDEX idx_orders_buyer_status  ON orders(buyer_id, status, created_at DESC);

-- Title and price are snapshotted so a later listing edit cannot rewrite what
-- the buyer agreed to; listing_id stays nullable because the seller may remove
-- the listing after ordering and the line must still render.
CREATE TABLE order_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID          NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    listing_id     UUID          REFERENCES listings(id)          ON DELETE SET NULL,
    title_snapshot VARCHAR(200)  NOT NULL,
    image_snapshot TEXT,
    unit_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
    quantity       INTEGER       NOT NULL DEFAULT 1,
    CONSTRAINT order_items_quantity_chk CHECK (quantity > 0)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
