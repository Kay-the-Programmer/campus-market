-- Two gates on selling, doing two different jobs:
--
--   seller_approval_status  the ENTRY gate - an admin must approve an account
--                           before it can create any listing at all.
--   users.verified          the existing TRUST badge. An approved-but-unverified
--                           seller lists freely, but their incoming orders are
--                           withheld for an admin to review first.
--
-- Collapsing them would make the held-order path unreachable: an unverified
-- seller would own no listings, so nothing could be ordered from one.

-- ------------------------------------------------------------------ users
ALTER TABLE users ADD COLUMN seller_approval_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE users ADD CONSTRAINT users_seller_approval_chk
    CHECK (seller_approval_status IN ('NOT_REQUESTED','PENDING','APPROVED','REJECTED'));

ALTER TABLE users ADD COLUMN seller_approval_reason TEXT;
ALTER TABLE users ADD COLUMN seller_requested_at    TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN seller_reviewed_at     TIMESTAMPTZ;

-- Grandfather everyone who could already sell. These accounts registered when
-- listing was unrestricted and many have live inventory; dropping them into
-- PENDING would retroactively pull their listings' owners offline and dump a
-- queue of long-standing sellers on the first admin to log in.
UPDATE users
   SET seller_approval_status = 'APPROVED',
       seller_reviewed_at     = now()
 WHERE account_type = 'SELLER';

-- Admins are approved by definition - they are the approvers. Recorded rather
-- than special-cased at read time so the column always tells the whole truth.
UPDATE users
   SET seller_approval_status = 'APPROVED',
       seller_reviewed_at     = COALESCE(seller_reviewed_at, now())
 WHERE role = 'ADMIN';

-- The approval queue is "PENDING, oldest first".
CREATE INDEX idx_users_seller_approval
    ON users(seller_approval_status, seller_requested_at)
 WHERE seller_approval_status = 'PENDING';

-- ----------------------------------------------------------------- orders
-- HELD is a new pre-PENDING state, so the existing status constraint has to be
-- replaced rather than added to.
ALTER TABLE orders DROP CONSTRAINT orders_status_chk;
ALTER TABLE orders ADD CONSTRAINT orders_status_chk
    CHECK (status IN ('HELD','PENDING','ACCEPTED','DECLINED','COMPLETED','CANCELLED'));

-- Set only when an admin supplied the goods themselves instead of passing the
-- order on to an unverified seller. ON DELETE SET NULL: losing the admin's row
-- must not erase the order.
ALTER TABLE orders ADD COLUMN fulfilled_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN admin_note  TEXT;
ALTER TABLE orders ADD COLUMN reviewed_at TIMESTAMPTZ;

-- The admin's review queue: held orders, oldest first.
CREATE INDEX idx_orders_held ON orders(created_at)
 WHERE status = 'HELD';

-- --------------------------------------------------------------- audit log
-- No CHECK on audit_logs.action, so the four new AuditAction constants
-- (APPROVE_SELLER, REJECT_SELLER, RELEASE_ORDER, FULFIL_ORDER) need no DDL.
