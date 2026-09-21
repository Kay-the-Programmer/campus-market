-- A conversation between an admin and someone applying to sell, held before
-- the application is decided.
--
-- Why not the existing conversations table: every conversation there is about
-- a listing (listing_id NOT NULL) between a buyer and a seller. An applicant
-- has no listing - not being allowed to list is the whole reason they are
-- applying - and the admin is neither buying nor selling. Bending that model to
-- fit would have meant a nullable listing, a partial unique index, and every
-- thread screen learning to render a conversation with no item at the top.
-- This is a small, purpose-built thread keyed on the applicant instead.
--
-- One thread per applicant, not per application: a rejected applicant who
-- re-applies continues the same conversation, which is what both sides want -
-- the admin sees what was said last time.

CREATE TABLE seller_application_messages (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The thread. CASCADE: an applicant who deletes their account takes the
    -- conversation with them; it was about them and nobody else needs it.
    applicant_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Who wrote it. SET NULL rather than CASCADE so that losing an admin's
    -- account does not erase what they told an applicant.
    sender_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    -- Direction, stored explicitly. Derivable from sender_id today, but not
    -- once sender_id has been nulled by the rule above - and "which side said
    -- this" is the one thing a thread must never lose.
    from_admin   BOOLEAN     NOT NULL,
    body         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- When the OTHER side first opened the thread after this was written.
    -- Null means unread by its recipient; the unread badges count these.
    read_at      TIMESTAMPTZ
);

-- Thread reads are "everything for this applicant, oldest first".
CREATE INDEX idx_seller_application_messages_thread
    ON seller_application_messages (applicant_id, created_at);

-- Unread counts are "unread messages for this applicant from one side".
CREATE INDEX idx_seller_application_messages_unread
    ON seller_application_messages (applicant_id, from_admin)
    WHERE read_at IS NULL;
