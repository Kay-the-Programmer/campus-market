-- Admin-mediated conversations, for orders held from an unverified seller.
--
-- When an admin fulfils a held order they supply the goods themselves, but the
-- sale still belongs to the seller: their stats, their review, their history.
-- So the thread is opened between buyer and seller as normal, with the admin
-- added as a third participant who brokered it - rather than a private admin
-- channel that would leave no buyer-seller record to hand over later.
--
-- The seller is unverified at that moment, which is the entire reason the order
-- was held, so the order's details are written into the thread WITHHELD from
-- them. Verification lifts that, and the thread they inherit is already whole.

-- --------------------------------------------------------- conversations
-- Null for every ordinary thread. Set only where an admin stood between the
-- two parties. ON DELETE SET NULL: losing the admin's row must not destroy the
-- conversation, exactly as orders.fulfilled_by_admin_id already behaves.
ALTER TABLE conversations
    ADD COLUMN mediator_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN conversations.mediator_admin_id IS
    'Admin who brokered this thread by fulfilling a held order. Grants them '
    'read/write access to a thread they are not otherwise a party to.';

-- -------------------------------------------------------------- messages
-- Deliberately a second, independent flag rather than a reuse of `flagged`.
--
-- `flagged` hides a message from its RECIPIENT because they blocked the sender;
-- this hides a message from the SELLER because they are not yet trusted with
-- it. They gate different people for different reasons and lift on different
-- events, and collapsing them would mean un-withholding on verification also
-- silently unblocked whoever the seller had blocked.
ALTER TABLE messages
    ADD COLUMN withheld_from_seller BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN messages.withheld_from_seller IS
    'Order details written while the seller was unverified. Cleared when the '
    'seller is verified; invisible to them until then, always visible to the '
    'buyer and to the mediating admin.';

-- Verification unseals every withheld message for one seller at once, so the
-- lookup is "withheld messages in threads whose seller is X".
CREATE INDEX idx_messages_withheld ON messages(conversation_id)
 WHERE withheld_from_seller;
