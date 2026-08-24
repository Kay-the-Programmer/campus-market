package com.campusmarket.config;

import com.campusmarket.domain.Listing;
import com.campusmarket.domain.ListingImage;
import com.campusmarket.domain.PromoSlot;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.PromoSlotRepository;
import com.campusmarket.service.ImageStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Moves images stored before {@link ImageStorageService} existed - inline
 * {@code data:} URIs sitting in listing and promo rows - onto disk, in place.
 *
 * <p>Runs on every boot but only ever does work once: after the first pass no
 * {@code data:} rows are left, so every later boot is a couple of cheap
 * queries that touch nothing. Safe to leave in permanently rather than
 * something to remember to remove - the next developer who inherits an old
 * database gets the same fix for free.
 *
 * <p>A row that fails to convert (an unrecognised image format, a truncated
 * value) is logged and left as-is rather than aborting startup - one bad
 * legacy row must not be able to take the API down.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LegacyImageMigrator implements CommandLineRunner {

    private final ListingRepository listingRepository;
    private final PromoSlotRepository promoSlotRepository;
    private final ImageStorageService imageStorageService;

    @Override
    @Transactional
    public void run(String... args) {
        int listingImages = migrateListingImages();
        int promoImages = migratePromoImages();
        if (listingImages > 0 || promoImages > 0) {
            log.info("Moved {} listing image(s) and {} promo image(s) from inline data to disk.",
                    listingImages, promoImages);
        }
    }

    private int migrateListingImages() {
        int moved = 0;
        for (Listing listing : listingRepository.findAll()) {
            for (ListingImage image : listing.getImages()) {
                String url = image.getUrl();
                if (url == null || !url.startsWith("data:")) {
                    continue;
                }
                try {
                    image.setUrl(imageStorageService.storeDataUri(url));
                    moved++;
                } catch (RuntimeException e) {
                    log.warn("Could not migrate image on listing {}: {}", listing.getId(), e.getMessage());
                }
            }
        }
        return moved;
    }

    private int migratePromoImages() {
        int moved = 0;
        for (PromoSlot promo : promoSlotRepository.findAll()) {
            String url = promo.getImageUrl();
            if (url == null || !url.startsWith("data:")) {
                continue;
            }
            try {
                promo.setImageUrl(imageStorageService.storeDataUri(url));
                moved++;
            } catch (RuntimeException e) {
                log.warn("Could not migrate image on promo slot {}: {}", promo.getId(), e.getMessage());
            }
        }
        return moved;
    }
}
