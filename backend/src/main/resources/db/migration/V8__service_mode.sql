-- How a service is actually obtained.
--
-- Every service used to funnel into "Request Booking", which fits a tutor and
-- misfits a printing shop: there is nothing to schedule, you walk in during
-- opening hours and collect your prints. Forcing a time slot on that made the
-- buyer invent one and the seller ignore it.
--
-- BOOKING  - a time has to be agreed first (tutoring, repairs, haircuts)
-- WALK_IN  - just turn up while they are around (printing, photocopying)

ALTER TABLE listings
    ADD COLUMN service_mode VARCHAR(16);

-- Existing services keep the behaviour they were published under. Backfilling
-- everything to WALK_IN would silently drop the booking step from listings
-- whose sellers are expecting to be asked for a time.
UPDATE listings
SET service_mode = 'BOOKING'
WHERE type = 'SERVICE' AND service_mode IS NULL;

-- Stays nullable, and null on non-services: a product has no service mode, and
-- a default of 'BOOKING' on every row would be a lie the DTO has to undo.
