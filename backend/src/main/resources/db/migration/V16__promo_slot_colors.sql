-- Custom colours for home-page panels.
--
-- Until now a panel's appearance came from `theme`, one of five preset
-- gradients. That is a good default and stays the default: every existing row
-- keeps working untouched, and an admin who does not care about colour never
-- has to think about it. These four columns are overrides, applied only where
-- they are set, which is why every one of them is nullable rather than
-- carrying a default that would silently flatten the gradients.
--
-- Stored as `#rrggbb`. The CHECK is the real guarantee - the admin form and
-- PromoService both validate, but this table is the last place a malformed
-- value could enter from, and a colour that is not a colour becomes broken
-- CSS on the busiest public page in the product.
ALTER TABLE promo_slots
    ADD COLUMN bg_color          VARCHAR(7),
    ADD COLUMN text_color        VARCHAR(7),
    ADD COLUMN button_color      VARCHAR(7),
    ADD COLUMN button_text_color VARCHAR(7);

ALTER TABLE promo_slots
    ADD CONSTRAINT promo_slots_bg_color_chk
        CHECK (bg_color IS NULL OR bg_color ~ '^#[0-9a-f]{6}$'),
    ADD CONSTRAINT promo_slots_text_color_chk
        CHECK (text_color IS NULL OR text_color ~ '^#[0-9a-f]{6}$'),
    ADD CONSTRAINT promo_slots_button_color_chk
        CHECK (button_color IS NULL OR button_color ~ '^#[0-9a-f]{6}$'),
    ADD CONSTRAINT promo_slots_button_text_color_chk
        CHECK (button_text_color IS NULL OR button_text_color ~ '^#[0-9a-f]{6}$');
