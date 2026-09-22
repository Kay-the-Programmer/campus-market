package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.SavedSearchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/**
 * Tells people when the thing they were waiting for finally gets listed.
 *
 * <p>The most common dead end on a catalogue this size is a search that has no
 * answer YET - nobody has a spare monitor today, and three appear next week.
 * That used to return an empty grid, and the person left with nothing tying
 * them to the moment it changed.
 *
 * <p>Matching happens in memory against the saved filters rather than by
 * re-running each search as a database query. One new listing against the
 * active alerts is a handful of field comparisons; turning it into one query
 * per saved search would put an unbounded number of round trips on the path
 * that publishes a listing.
 *
 * <p>Nothing here may prevent a listing being published. A seller posting an
 * item must not see an error because somebody else's alert failed, so the
 * whole pass runs in its own transaction and swallows its own failures.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SavedSearchNotifier {

    private final SavedSearchRepository savedSearchRepository;
    private final NotificationService notificationService;

    /**
     * At most one alert per saved search per hour.
     *
     * <p>Someone who saves "textbooks under K200" the week term starts would
     * otherwise get a notification every few minutes. Five alerts in a row is
     * how a person turns notifications off entirely - which costs them every
     * future alert, not just the noisy ones - so the limit protects the channel
     * rather than the server.
     */
    private static final Duration QUIET_PERIOD = Duration.ofHours(1);

    /**
     * Runs after a listing is published, against every active alert.
     *
     * <p>REQUIRES_NEW so a failure here cannot roll back the publish that
     * triggered it. The listing existing is the important outcome; the alerts
     * are a courtesy on top of it.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void listingPublished(Listing listing) {
        if (listing == null || listing.getStatus() != ListingStatus.ACTIVE || listing.isDeleted()) {
            return;
        }
        try {
            Instant now = Instant.now();
            List<SavedSearch> active = savedSearchRepository.findByNotifyTrue();

            for (SavedSearch search : active) {
                // Never tell a seller that their own listing has appeared.
                if (search.getUser() == null
                        || search.getUser().getId().equals(listing.getSeller().getId())) {
                    continue;
                }
                if (withinQuietPeriod(search, now) || !matches(search, listing)) {
                    continue;
                }

                notificationService.notify(
                        search.getUser(),
                        NotificationType.SAVED_UPDATE,
                        "New match for \"" + search.getLabel() + "\"",
                        listing.getTitle() + " was just listed.",
                        "/listing/" + listing.getId());

                search.setLastNotifiedAt(now);
                savedSearchRepository.save(search);
            }
        } catch (RuntimeException e) {
            log.warn("Saved-search alerts failed for listing {}: {}", listing.getId(), e.toString());
        }
    }

    private boolean withinQuietPeriod(SavedSearch search, Instant now) {
        Instant last = search.getLastNotifiedAt();
        return last != null && last.isAfter(now.minus(QUIET_PERIOD));
    }

    /**
     * Whether a listing satisfies a saved search.
     *
     * <p>Every filter is AND-ed and a null filter means "any", which is exactly
     * how browse reads them - see ListingSpecifications, where each spec
     * returns null and drops out when its argument is absent.
     *
     * <p>The text test is the one deliberate simplification: it matches the
     * whole phrase against the title and description rather than reproducing
     * the tokenizer. An alert firing slightly less often than the search page
     * would list is the safe direction to be wrong in - the opposite would send
     * people notifications about things they did not ask for.
     */
    private boolean matches(SavedSearch search, Listing listing) {
        if (search.getType() != null
                && !search.getType().equalsIgnoreCase(listing.getType().name())) {
            return false;
        }
        if (search.getCategory() != null
                && (listing.getCategory() == null
                    || !search.getCategory().getId().equals(listing.getCategory().getId()))) {
            return false;
        }
        if (search.getCampusZone() != null
                && (listing.getCampusZone() == null
                    || !search.getCampusZone().equalsIgnoreCase(listing.getCampusZone().name()))) {
            return false;
        }

        BigDecimal price = listing.getPrice();
        if (search.getMinPrice() != null
                && (price == null || price.compareTo(search.getMinPrice()) < 0)) {
            return false;
        }
        if (search.getMaxPrice() != null
                && (price == null || price.compareTo(search.getMaxPrice()) > 0)) {
            return false;
        }

        String query = search.getQuery();
        if (query != null && !query.isBlank()) {
            String needle = query.trim().toLowerCase(Locale.ROOT);
            String title = listing.getTitle() == null ? "" : listing.getTitle().toLowerCase(Locale.ROOT);
            String body = listing.getDescription() == null
                    ? "" : listing.getDescription().toLowerCase(Locale.ROOT);
            return title.contains(needle) || body.contains(needle);
        }
        return true;
    }
}
