-- Some services cannot honestly be priced until the seller has seen the job.
--
-- "Phone screen repair" has no number on it before someone says what is broken
-- and which handset it is. A seller forced to type one either invents a figure
-- they will have to walk back in chat, or lists at 0 - which renders as "K0"
-- on every card and reads as "free". Both are worse than saying nothing and
-- agreeing it afterwards, which is what these sellers already do.
--
-- Null therefore means "not priced here, ask", and is kept distinct from 0,
-- which stays a real price meaning free. That distinction earns its keep on a
-- student marketplace, where giving away a mattress at the end of term is a
-- normal listing.
ALTER TABLE listings ALTER COLUMN price DROP NOT NULL;

-- listings_price_chk (price >= 0) is left exactly as it is. A CHECK evaluates
-- to UNKNOWN rather than false for a null column and so admits the new rows,
-- while still rejecting a negative price the moment one is supplied.

-- Only a service may go unpriced. A product or a meal with no price is a bug
-- somewhere upstream, and this is the one place that cannot be bypassed by a
-- new caller, a backfill or a fixture.
ALTER TABLE listings
    ADD CONSTRAINT listings_price_required_chk
    CHECK (price IS NOT NULL OR type = 'SERVICE');
