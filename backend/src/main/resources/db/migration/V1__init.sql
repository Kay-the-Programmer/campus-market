-- CampusMarket schema.
-- Emails are stored lower-cased by the application so a plain UNIQUE constraint
-- is sufficient (no citext extension required).

-- ---------------------------------------------------------------- users
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(120)  NOT NULL,
    email                 VARCHAR(255)  NOT NULL UNIQUE,
    password_hash         VARCHAR(255)  NOT NULL,
    role                  VARCHAR(20)   NOT NULL DEFAULT 'CUSTOMER',
    email_verified        BOOLEAN       NOT NULL DEFAULT FALSE,
    verified              BOOLEAN       NOT NULL DEFAULT FALSE,
    status                VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    suspended_until       TIMESTAMPTZ,
    status_reason         TEXT,
    department            VARCHAR(120),
    year                  VARCHAR(60),
    avatar_url            TEXT,
    bio                   TEXT,
    phone                 VARCHAR(60),
    private_address       TEXT,
    rating_avg            NUMERIC(3,2)  NOT NULL DEFAULT 0,
    reviews_count         INTEGER       NOT NULL DEFAULT 0,
    failed_login_attempts INTEGER       NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT users_role_chk   CHECK (role IN ('CUSTOMER','ADMIN')),
    CONSTRAINT users_status_chk CHECK (status IN ('ACTIVE','SUSPENDED','BANNED'))
);

-- Opaque server-side sessions. Chosen over stateless JWT so that banning a user
-- or resetting a password can invalidate access immediately (RBAC rules 7 & 4.5).
CREATE TABLE user_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ  NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);

-- Email verification and password reset tokens.
CREATE TABLE auth_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(120) NOT NULL UNIQUE,
    type       VARCHAR(30)  NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT auth_tokens_type_chk CHECK (type IN ('EMAIL_VERIFICATION','PASSWORD_RESET'))
);
CREATE INDEX idx_auth_tokens_user_type ON auth_tokens(user_id, type);

-- ---------------------------------------------------------------- catalog
CREATE TABLE categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(80)  NOT NULL,
    slug       VARCHAR(80)  NOT NULL UNIQUE,
    icon       VARCHAR(60),
    parent_id  UUID REFERENCES categories(id) ON DELETE RESTRICT,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE listings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type           VARCHAR(20)   NOT NULL,
    title          VARCHAR(180)  NOT NULL,
    description    TEXT          NOT NULL DEFAULT '',
    price          NUMERIC(12,2) NOT NULL,
    price_unit     VARCHAR(20),
    category_id    UUID REFERENCES categories(id) ON DELETE RESTRICT,
    location       VARCHAR(160),
    status         VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    deleted        BOOLEAN       NOT NULL DEFAULT FALSE,
    deleted_at     TIMESTAMPTZ,
    -- product-specific
    condition      VARCHAR(20),
    brand          VARCHAR(80),
    -- service-specific
    availability   TEXT,
    rate_type      VARCHAR(20),
    -- food-specific
    quantity       INTEGER,
    pickup_window  VARCHAR(120),
    views_count    INTEGER       NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT listings_type_chk   CHECK (type   IN ('PRODUCT','SERVICE','FOOD')),
    CONSTRAINT listings_status_chk CHECK (status IN ('DRAFT','ACTIVE','RESERVED','SOLD')),
    CONSTRAINT listings_price_chk  CHECK (price >= 0)
);
CREATE INDEX idx_listings_seller   ON listings(seller_id);
CREATE INDEX idx_listings_status   ON listings(status) WHERE deleted = FALSE;
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_type     ON listings(type);

CREATE TABLE listing_images (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID    NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url        TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_listing_images_listing ON listing_images(listing_id);

CREATE TABLE listing_dietary_tags (
    listing_id UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    tag        VARCHAR(40) NOT NULL,
    PRIMARY KEY (listing_id, tag)
);

-- ---------------------------------------------------------------- shopping
CREATE TABLE saved_listings (
    user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    listing_id UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE cart_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    listing_id UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    quantity   INTEGER     NOT NULL DEFAULT 1,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cart_items_qty_chk CHECK (quantity > 0),
    CONSTRAINT cart_items_unique  UNIQUE (user_id, listing_id)
);

-- ---------------------------------------------------------------- messaging
-- One conversation per (listing, buyer, seller) triple - workflow 15 step 1.
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    buyer_id        UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    seller_id       UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT conversations_unique UNIQUE (listing_id, buyer_id, seller_id)
);
CREATE INDEX idx_conversations_buyer  ON conversations(buyer_id);
CREATE INDEX idx_conversations_seller ON conversations(seller_id);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    body            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ,
    -- Messages from a blocked sender are stored and flagged for admins rather
    -- than rejected, so bad actors are not tipped off (workflow 15).
    flagged         BOOLEAN     NOT NULL DEFAULT FALSE,
    flag_reason     VARCHAR(80)
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE user_blocks (
    blocker_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
);

-- ---------------------------------------------------------------- deals
CREATE TABLE deals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID          NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    buyer_id        UUID          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    seller_id       UUID          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    price           NUMERIC(12,2) NOT NULL,
    meetup_location VARCHAR(160),
    meetup_time     TIMESTAMPTZ,
    status          VARCHAR(20)   NOT NULL DEFAULT 'COMPLETED',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT deals_status_chk CHECK (status IN ('PENDING','COMPLETED','CANCELLED'))
);
CREATE INDEX idx_deals_buyer   ON deals(buyer_id);
CREATE INDEX idx_deals_seller  ON deals(seller_id);
CREATE INDEX idx_deals_listing ON deals(listing_id);

CREATE TABLE reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id     UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    reviewer_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INTEGER     NOT NULL,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5),
    -- One review per deal per reviewer (workflow 16).
    CONSTRAINT reviews_unique     UNIQUE (deal_id, reviewer_id)
);
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);

-- ---------------------------------------------------------------- moderation
CREATE TABLE reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type         VARCHAR(20) NOT NULL,
    target_listing_id   UUID REFERENCES listings(id) ON DELETE CASCADE,
    target_user_id      UUID REFERENCES users(id)    ON DELETE CASCADE,
    reason              VARCHAR(40) NOT NULL,
    details             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    resolution          VARCHAR(30),
    resolved_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ,
    is_duplicate        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reports_target_chk CHECK (target_type IN ('LISTING','USER')),
    CONSTRAINT reports_status_chk CHECK (status IN ('PENDING','RESOLVED')),
    CONSTRAINT reports_reason_chk CHECK (reason IN
        ('SCAM','INAPPROPRIATE_CONTENT','PROHIBITED_ITEM','HARASSMENT','OTHER')),
    CONSTRAINT reports_resolution_chk CHECK (resolution IS NULL OR resolution IN
        ('DISMISSED','LISTING_REMOVED','USER_BANNED')),
    -- A report must point at exactly one target.
    CONSTRAINT reports_one_target_chk CHECK (
        (target_type = 'LISTING' AND target_listing_id IS NOT NULL AND target_user_id IS NULL) OR
        (target_type = 'USER'    AND target_user_id    IS NOT NULL AND target_listing_id IS NULL)
    )
);
CREATE INDEX idx_reports_status ON reports(status, created_at);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(30)  NOT NULL,
    title      VARCHAR(180) NOT NULL,
    body       TEXT,
    link       VARCHAR(255),
    read       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at);

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      VARCHAR(40) NOT NULL,
    target_type VARCHAR(20),
    target_id   UUID,
    reason      TEXT,
    details     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
