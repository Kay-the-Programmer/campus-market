-- Seller-set discounts: the "Deals" shelf buyers can actually browse.
--
-- No new columns. `compare_at_price` already exists from V7, where only an
-- admin could set it as part of curating the Special Offers shelf. Nothing
-- about the column was admin-specific - the restriction lived in the service -
-- so opening it to sellers is a permission change, not a schema change.
--
-- The two ideas stay separate on purpose:
--   * compare_at_price  - the seller's own "was" price. Anyone may set it on
--                         their own listing, and it is what `hasDiscount`
--                         filters and the discount badge renders.
--   * special_offer     - editorial placement on the home shelf. Still admin
--                         only; see AdminService.setSpecialOffer.
--
-- What this migration adds is the index for the new query. "Reduced listings,
-- deepest saving first" runs on every visit to /offers and on the Deals pill,
-- and without it that is a sequential scan of the whole catalogue to find a
-- handful of rows.
--
-- Partial, because the predicate is highly selective - most listings are not
-- reduced - so the index stays proportional to the deals rather than to the
-- catalogue. The WHERE mirrors ListingSpecifications.hasDiscount exactly; if
-- that test ever changes, this has to change with it or the planner will stop
-- using the index.
CREATE INDEX idx_listings_discounted
    ON listings (created_at DESC)
    WHERE compare_at_price IS NOT NULL
      AND compare_at_price > price
      AND deleted = FALSE;
