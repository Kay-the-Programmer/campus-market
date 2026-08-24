package com.campusmarket.service;

import com.campusmarket.domain.Conversation;
import com.campusmarket.domain.Listing;
import com.campusmarket.domain.ListingStatus;
import com.campusmarket.domain.ListingType;
import com.campusmarket.domain.ServiceMode;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Workflow 14: request a service booking. */
@Service
@RequiredArgsConstructor
public class BookingService {

    private static final DateTimeFormatter WHEN =
            DateTimeFormatter.ofPattern("EEEE d MMMM 'at' h:mm a").withZone(ZoneOffset.UTC);

    private final ListingRepository listingRepository;
    private final ConversationService conversationService;
    private final AccessGuard accessGuard;

    @Transactional
    public Map<String, Object> requestBooking(Principal principal,
                                              UUID listingId,
                                              Instant preferredTime,
                                              String note) {
        accessGuard.requireVerifiedCustomer(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(listingId)
                .orElseThrow(() -> ApiException.notFound("This service is no longer available."));

        if (listing.getType() != ListingType.SERVICE) {
            throw ApiException.badRequest("NOT_A_SERVICE",
                    "Only service listings can be booked. Add products and food to your cart instead.");
        }
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw ApiException.badRequest("LISTING_UNAVAILABLE",
                    "This service is not currently accepting bookings.");
        }
        // A walk-in service has no diary to put a slot in. Sending one would
        // give the buyer a false sense that a time had been reserved.
        if (listing.getServiceMode() == ServiceMode.WALK_IN) {
            throw ApiException.badRequest("WALK_IN_SERVICE",
                    "This one doesn't need booking - message " + listing.getSeller().getName()
                            + " and drop in during their hours.");
        }
        if (preferredTime == null) {
            throw ApiException.badRequest("Choose a preferred date and time.");
        }

        boolean outsideStated = isOutsideStatedAvailability(listing, preferredTime);

        StringBuilder message = new StringBuilder()
                .append("Booking request for \"").append(listing.getTitle()).append("\"\n")
                .append("Preferred time: ").append(WHEN.format(preferredTime));
        if (note != null && !note.isBlank()) {
            message.append("\n\nNote: ").append(note.trim());
        }
        if (outsideStated) {
            // Allowed anyway - the seller can counter-propose in chat (workflow 14).
            message.append("\n\n(I know this may fall outside your stated availability - ")
                    .append("happy to work around your schedule.)");
        }

        Conversation conversation = conversationService.findOrCreate(listing, principal.user());
        conversationService.postMessage(conversation, principal.user(), message.toString());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("conversationId", conversation.getId());
        body.put("outsideStatedAvailability", outsideStated);
        body.put("statedAvailability", listing.getAvailability());
        body.put("message", outsideStated
                ? "Request sent. Note this is outside the seller's stated availability - they may propose another time."
                : "Booking request sent. The seller will confirm in chat.");
        return body;
    }

    /**
     * Availability is free text ("Weekdays after 5pm, Sat mornings"), so this is a
     * best-effort day-name check rather than a real calendar. It only drives a
     * soft warning - the request always goes through.
     */
    private boolean isOutsideStatedAvailability(Listing listing, Instant preferredTime) {
        String availability = listing.getAvailability();
        if (availability == null || availability.isBlank()) {
            return false;
        }
        String haystack = availability.toLowerCase(Locale.ROOT);
        if (haystack.contains("any") || haystack.contains("flexible") || haystack.contains("daily")) {
            return false;
        }
        String day = preferredTime.atZone(ZoneOffset.UTC).getDayOfWeek()
                .getDisplayName(TextStyle.FULL, Locale.ENGLISH).toLowerCase(Locale.ROOT);
        String shortDay = day.substring(0, 3);

        boolean weekend = day.startsWith("sat") || day.startsWith("sun");
        if (!weekend && (haystack.contains("weekday") || haystack.contains("mon-fri"))) {
            return false;
        }
        if (weekend && haystack.contains("weekend")) {
            return false;
        }
        return !haystack.contains(day) && !haystack.contains(shortDay);
    }
}
