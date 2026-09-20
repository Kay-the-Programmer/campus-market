package com.campusmarket.service;

import com.campusmarket.domain.Listing;
import com.campusmarket.domain.ListingStatus;
import com.campusmarket.domain.NotificationType;
import com.campusmarket.repository.SavedListingRepository;
import com.campusmarket.repository.UserRepository;
import com.campusmarket.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/**
 * Tells the people who saved a listing when something about it changes.
 *
 * <p>Saving something is the clearest signal a student gives that they want it
 * but not yet, so this is the only family of notifications the app sends that
 * nobody individually asked for. That makes restraint the design constraint
 * rather than an afterthought: each method here fires at most once per real
 * change, and only for changes that alter whether or how someone can still buy
 * the thing. A retitled listing or a reworded description sends nothing.
 *
 * <p>Extracted from ListingService because {@link DealService} marks listings
 * sold down a different path, and resolving watchers - read the saved rows,
 * load the users, drop the seller - was about to be written a third time.
 *
 * <p>Delivery is not this class's problem. {@link NotificationService} writes
 * the row and fans out to push and email, each gated by the recipient's own
 * preferences, so nothing here decides how anyone hears about it.
 */
@Service
@RequiredArgsConstructor
public class SavedListingNotifier {

    private final SavedListingRepository savedListingRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    /**
     * A real price decrease on a listing that is still buyable.
     *
     * <p>Deliberately narrow: only decreases, only while ACTIVE, and never to
     * the seller who just made the edit.
     */
    public void priceDropped(Listing listing, BigDecimal previousPrice) {
        if (previousPrice == null || listing.getPrice() == null
                || listing.getStatus() != ListingStatus.ACTIVE
                || listing.getPrice().compareTo(previousPrice) >= 0) {
            return;
        }

        // Scales are normalised so the three figures read as one sentence:
        // an unscaled edit produces "Now K188 - down K7.00 from K195.00".
        BigDecimal newPrice = money(listing.getPrice());
        BigDecimal oldPrice = money(previousPrice);
        String body = "Now " + Money.format(newPrice)
                + " - down " + Money.format(oldPrice.subtract(newPrice))
                + " from " + Money.format(oldPrice) + ".";

        notifyWatchers(listing, NotificationType.PRICE_DROP,
                "Price drop: " + listing.getTitle(), body);
    }

    /**
     * The listing is gone.
     *
     * <p>Worth sending precisely because it is bad news: someone who saved an
     * item is checking back on it, and the useful thing to tell them is that
     * they can stop. Sent once, on the transition into SOLD.
     */
    public void soldOut(Listing listing) {
        notifyWatchers(listing, NotificationType.SAVED_UPDATE,
                "Sold: " + listing.getTitle(),
                "This item has been sold, so it is no longer available.");
    }

    /**
     * A reservation fell through and the item is buyable again.
     *
     * <p>The highest-intent moment this class has: the watcher already decided
     * they wanted it, and had been beaten to it.
     */
    public void availableAgain(Listing listing) {
        notifyWatchers(listing, NotificationType.SAVED_UPDATE,
                "Available again: " + listing.getTitle(),
                "The reservation on this item has ended, so it is back up for sale.");
    }

    /**
     * A listing that had run out has stock again.
     *
     * <p>Only meaningful for the quantity-tracked kinds - a food seller who
     * cooks another batch. Triggered by the count going from zero to positive,
     * not by any increase, so restocking from 3 to 8 stays quiet.
     */
    public void backInStock(Listing listing) {
        Integer quantity = listing.getQuantity();
        String body = quantity == null
                ? "This item is available again."
                : "There " + (quantity == 1 ? "is 1 portion" : "are " + quantity + " portions")
                        + " available again.";

        notifyWatchers(listing, NotificationType.SAVED_UPDATE,
                "Back in stock: " + listing.getTitle(), body);
    }

    /**
     * Fans out to everyone who saved this listing except its seller.
     *
     * <p>The seller exclusion is not cosmetic - a seller who saved their own
     * item would otherwise be told about every edit they had just made.
     */
    private void notifyWatchers(Listing listing, NotificationType type, String title, String body) {
        List<UUID> watcherIds = savedListingRepository.findUserIdsByListingId(listing.getId());
        if (watcherIds.isEmpty()) {
            return;
        }

        UUID sellerId = listing.getSeller() == null ? null : listing.getSeller().getId();
        String link = "/listing/" + listing.getId();

        userRepository.findAllById(watcherIds).stream()
                .filter(watcher -> !watcher.getId().equals(sellerId))
                .forEach(watcher -> notificationService.notify(watcher, type, title, body, link));
    }

    private BigDecimal money(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_UP);
    }
}
