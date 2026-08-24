package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.*;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.util.Money;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.dto.ListingDtos.PageDto;
import com.campusmarket.web.dto.ListingDtos.SuggestionDto;
import com.campusmarket.web.dto.ListingDtos.SuggestionsDto;
import com.campusmarket.web.error.ApiException;
import com.campusmarket.web.request.ListingRequests.SaveListingRequest;
import com.campusmarket.web.request.ListingRequests.StatusChangeRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Workflows 6, 7, 8 and 10: create, edit, delete and browse listings. */
@Service
@RequiredArgsConstructor
public class ListingService {

    private final ListingRepository listingRepository;
    private final CategoryRepository categoryRepository;
    private final SavedListingRepository savedListingRepository;
    private final ConversationRepository conversationRepository;
    private final CartItemRepository cartItemRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    /** Records edits an admin makes to someone else's listing. */
    private final AuditService auditService;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    // ----------------------------------------------------------- workflow 10
    @Transactional(readOnly = true)
    public PageDto<ListingDto> search(Principal principal,
                                      String search,
                                      String type,
                                      UUID categoryId,
                                      BigDecimal minPrice,
                                      BigDecimal maxPrice,
                                      String condition,
                                      String location,
                                      String campusZone,
                                      UUID sellerId,
                                      String sort,
                                      Boolean specialOffer,
                                      int page,
                                      int size) {

        Specification<Listing> spec = ListingSpecifications.publiclyVisible();
        spec = and(spec, ListingSpecifications.textSearch(search));
        spec = and(spec, ListingSpecifications.ofType(type));
        spec = and(spec, ListingSpecifications.inCategory(categoryId));
        spec = and(spec, ListingSpecifications.priceAtLeast(minPrice));
        spec = and(spec, ListingSpecifications.priceAtMost(maxPrice));
        spec = and(spec, ListingSpecifications.withCondition(condition));
        spec = and(spec, ListingSpecifications.atLocation(location));
        spec = and(spec, ListingSpecifications.inZone(campusZone));
        spec = and(spec, ListingSpecifications.bySeller(sellerId));
        spec = and(spec, ListingSpecifications.onlySpecialOffers(specialOffer));

        int safeSize = Math.min(Math.max(size, 1), 60);
        int safePage = Math.max(page, 0);

        /*
         * Relevance is the default the moment there is something to be relevant
         * TO, which is what every other search box does. Without a term it is
         * meaningless, so an explicit sort=relevance on a bare browse falls back
         * to newest rather than ordering by a rank every row scores the same on.
         */
        boolean hasTerm = search != null && !search.isBlank();
        boolean byRelevance = hasTerm
                && (sort == null || sort.isBlank() || "relevance".equalsIgnoreCase(sort.trim()));

        Sort ordering;
        if (byRelevance) {
            spec = and(spec, ListingSpecifications.orderByRelevance(search));
            // The spec owns the ORDER BY. Anything here would be appended after
            // it by Spring Data and, being unique per row, would win outright.
            ordering = Sort.unsorted();
        } else {
            ordering = resolveSort(sort);
        }

        Page<Listing> result = listingRepository.findAll(spec,
                PageRequest.of(safePage, safeSize, ordering));

        Set<UUID> saved = savedIdsFor(principal);
        List<ListingDto> items = result.getContent().stream()
                .map(listing -> mapper.listing(listing, principal, saved))
                .toList();

        return new PageDto<>(items, safePage, safeSize, result.getTotalElements(), result.getTotalPages());
    }

    /**
     * Search-as-you-type suggestions.
     *
     * <p>Public and deliberately cheap: it runs on every keystroke, so it reuses
     * the same visibility rules as browse but returns a hard-capped, minimal
     * projection rather than full listing DTOs.
     *
     * <p>A blank query returns nothing rather than "everything" - an empty box
     * has nothing to suggest, and the client shows recent searches there
     * instead.
     */
    @Transactional(readOnly = true)
    public SuggestionsDto suggest(String term, int limit) {
        String query = term == null ? "" : term.trim();
        if (query.length() < 2) {
            return new SuggestionsDto(List.of(), List.of());
        }
        int cap = Math.min(Math.max(limit, 1), 10);

        Specification<Listing> spec = ListingSpecifications.publiclyVisible();
        spec = and(spec, ListingSpecifications.textSearch(query));

        List<SuggestionDto> listings = listingRepository
                .findAll(spec, PageRequest.of(0, cap, Sort.by(Sort.Direction.DESC, "viewsCount")))
                .getContent().stream()
                .map(listing -> new SuggestionDto(
                        "listing",
                        listing.getId(),
                        listing.getTitle(),
                        listing.getType().name(),
                        listing.getImages().isEmpty() ? null : listing.getImages().get(0).getUrl(),
                        listing.getPrice()))
                .toList();

        String needle = query.toLowerCase();
        List<SuggestionDto> categories = categoryRepository.findAllByOrderBySortOrderAscNameAsc()
                .stream()
                .filter(c -> c.getName().toLowerCase().contains(needle))
                .map(c -> {
                    long count = listingRepository.count(ListingSpecifications.publicInCategory(c.getId()));
                    return new SuggestionDto(
                            "category", c.getId(), c.getName(),
                            count + (count == 1 ? " listing" : " listings"), null, null);
                })
                // A category with nothing a shopper can reach is a dead end,
                // not a suggestion. Dropped before the limit rather than after
                // it: taking four first let four dead ends fill every slot and
                // hide the stocked categories behind them - which the stricter
                // count above makes likelier, since a shelf of sold items now
                // correctly reads as empty. The stream is lazy, so this still
                // stops counting once four have survived.
                .filter(s -> !s.detail().startsWith("0 "))
                .limit(4)
                .toList();

        return new SuggestionsDto(listings, categories);
    }

    @Transactional
    public ListingDto getById(Principal principal, UUID id) {
        Listing listing = listingRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));

        boolean isOwner = principal.owns(listing.getSeller().getId());
        boolean privileged = isOwner || principal.isAdmin();

        // A removed listing is gone for everyone but its owner and moderators.
        if (listing.isDeleted() && !privileged) {
            throw ApiException.notFound("This listing is no longer available.");
        }
        // Drafts are private until published.
        if (listing.getStatus() == ListingStatus.DRAFT && !privileged) {
            throw ApiException.notFound("Listing not found.");
        }

        if (!isOwner) {
            listing.setViewsCount(listing.getViewsCount() + 1);
        }

        return mapper.listing(listing, principal, savedIdsFor(principal));
    }

    @Transactional(readOnly = true)
    public List<ListingDto> myListings(Principal principal) {
        // Scoped to principal.id() below, so this only ever returns your own
        // rows. Admins now appear here too - they are allowed to sell.
        accessGuard.requireOwnerContext(principal);
        Set<UUID> saved = savedIdsFor(principal);
        return listingRepository.findBySellerIdAndDeletedFalseOrderByCreatedAtDesc(principal.id()).stream()
                .map(listing -> mapper.listing(listing, principal, saved))
                .toList();
    }

    // ------------------------------------------------------------ workflow 6
    @Transactional
    public ListingDto create(Principal principal, SaveListingRequest request) {
        // Buying-only accounts are refused here, not just in the UI - the button
        // being hidden is a courtesy, this is the actual gate.
        accessGuard.requireSeller(principal);

        Listing listing = new Listing();
        listing.setSeller(principal.user());
        listing.setStatus(parseStatusForSave(request.status()));
        applyRequest(listing, request);
        validateForStatus(listing);

        listingRepository.save(listing);
        return mapper.listing(listing, principal, savedIdsFor(principal));
    }

    // ------------------------------------------------------------ workflow 7
    @Transactional
    public ListingDto update(Principal principal, UUID id, SaveListingRequest request) {
        accessGuard.requireOwnerContext(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));

        // Ownership before anything else (RBAC rule 1), with admins allowed
        // through as moderators - they run the catalogue and have to be able to
        // correct a mispriced or miscategorised listing without impersonating
        // the seller. Editing someone else's is audited below.
        accessGuard.requireOwnerOrAdmin(principal, listing.getSeller().getId(),
                "You can only edit your own listings.");
        boolean actingOnBehalf = !principal.owns(listing.getSeller().getId());

        if (listing.getStatus() == ListingStatus.SOLD) {
            // Buyers already negotiated against the old price and photos, so a sold
            // listing may only be re-described or re-statused - not re-priced.
            applySoldListingEdits(listing, request);
        } else {
            BigDecimal previousPrice = listing.getPrice();
            applyRequest(listing, request);
            if (request.status() != null && !request.status().isBlank()) {
                listing.setStatus(parseStatusForSave(request.status()));
            }
            validateForStatus(listing);
            notifyPriceDrop(listing, previousPrice);
        }

        if (actingOnBehalf) {
            auditService.record(principal.user(), AuditAction.EDIT_LISTING,
                    "listing", listing.getId(), null,
                    "Edited \"" + listing.getTitle() + "\" on behalf of "
                            + listing.getSeller().getName() + ".");
            // The seller finds out from us rather than from a buyer asking why
            // their price changed.
            notificationService.notify(listing.getSeller(), NotificationType.MODERATION,
                    "Your listing was edited",
                    "\"" + listing.getTitle() + "\" was updated by a moderator.",
                    "/my-listings");
        }

        return mapper.listing(listing, principal, savedIdsFor(principal));
    }

    /** Available / Reserved / Sold toggle from My Listings or the edit page. */
    @Transactional
    public ListingDto changeStatus(Principal principal, UUID id, StatusChangeRequest request) {
        accessGuard.requireOwnerContext(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));
        accessGuard.requireOwnerOrAdmin(principal, listing.getSeller().getId(),
                "You can only change the status of your own listings.");

        ListingStatus target = parseStatus(request.status());
        if (target == ListingStatus.SOLD) {
            // Marking sold creates a deal and needs a buyer, so it has its own flow.
            throw ApiException.badRequest("USE_MARK_SOLD",
                    "Use the Mark as Sold flow so the sale is recorded against a buyer.");
        }
        listing.setStatus(target);
        return mapper.listing(listing, principal, savedIdsFor(principal));
    }

    // ------------------------------------------------------------ workflow 8
    @Transactional
    public Map<String, Object> delete(Principal principal, UUID id, boolean confirmed) {
        accessGuard.requireAuthenticated(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));

        accessGuard.requireOwnerOrAdmin(principal, listing.getSeller().getId(),
                "You can only delete your own listings.");

        /*
         * An unconfirmed call is a question, never an action.
         *
         * It used to delete outright whenever nothing was mid-negotiation, so
         * the confirmation the client asks for arrived only in the one case the
         * server considered risky. That inverted it in practice: a listing
         * nobody had messaged about was destroyed on the first click, with the
         * confirm dialog flashing open and shut behind the response, while a
         * listing under active discussion got a real prompt. Deletion is not
         * reversible from the app, so the prompt is now unconditional and the
         * count only decides how loudly it warns.
         */
        long conversations = conversationRepository.findByListingId(listing.getId()).size();
        if (!confirmed) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
                    "CONFIRM_REQUIRED",
                    conversations > 0
                            ? "You have " + conversations + " active conversation(s) about this "
                                    + "item. Delete anyway?"
                            : "This will remove the listing. Delete it?",
                    Map.of("conversationCount", conversations, "requiresConfirmation", true));
        }

        // Soft delete: chat threads and deal history still resolve the listing and
        // render it as "Listing removed" (workflow 8).
        listing.setDeleted(true);
        listing.setDeletedAt(Instant.now());
        listing.setStatus(ListingStatus.DRAFT);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "Listing removed.");
        return body;
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Tells everyone who saved this listing that it just got cheaper.
     *
     * <p>Saving something is the clearest signal a student gives that they want
     * it but not at that price, so this is the one notification the app sends
     * that nobody explicitly triggered. It is deliberately narrow: only real
     * decreases on a listing that is still buyable, and never to the seller who
     * just made the edit.
     */
    private void notifyPriceDrop(Listing listing, BigDecimal previousPrice) {
        if (previousPrice == null || listing.getPrice() == null
                || listing.getStatus() != ListingStatus.ACTIVE
                || listing.getPrice().compareTo(previousPrice) >= 0) {
            return;
        }

        List<UUID> watcherIds = savedListingRepository.findUserIdsByListingId(listing.getId());
        if (watcherIds.isEmpty()) {
            return;
        }

        // Scales are normalised so the three figures read as one sentence:
        // an unscaled edit produces "Now K188 - down K7.00 from K195.00".
        BigDecimal newPrice = money(listing.getPrice());
        BigDecimal oldPrice = money(previousPrice);
        String body = "Now " + Money.format(newPrice)
                + " - down " + Money.format(oldPrice.subtract(newPrice))
                + " from " + Money.format(oldPrice) + ".";

        userRepository.findAllById(watcherIds).stream()
                .filter(watcher -> !watcher.getId().equals(listing.getSeller().getId()))
                .forEach(watcher -> notificationService.notify(
                        watcher,
                        NotificationType.PRICE_DROP,
                        "Price drop: " + listing.getTitle(),
                        body,
                        "/listing/" + listing.getId()));
    }

    private BigDecimal money(BigDecimal amount) {
        return amount.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private Set<UUID> savedIdsFor(Principal principal) {
        if (principal.isGuest() || principal.isAdmin()) {
            return Set.of();
        }
        return savedListingRepository.findListingIdsByUserId(principal.id());
    }

    private void applyRequest(Listing listing, SaveListingRequest request) {
        listing.setType(parseType(request.type()));
        listing.setTitle(request.title().trim());
        listing.setDescription(request.description() == null ? "" : request.description().trim());
        listing.setPrice(request.price());
        listing.setPriceUnit(blankToNull(request.priceUnit()));
        listing.setLocation(blankToNull(request.location()));
        listing.setCampusZone(parseCampusZone(request.campusZone()));

        if (request.categoryId() != null) {
            listing.setCategory(categoryRepository.findById(request.categoryId())
                    .orElseThrow(() -> ApiException.badRequest("Unknown category.")));
        } else {
            listing.setCategory(null);
        }

        listing.setCondition(parseCondition(request.condition()));
        listing.setBrand(blankToNull(request.brand()));
        listing.setAvailability(blankToNull(request.availability()));
        listing.setRateType(parseRateType(request.rateType()));
        // Only services carry a mode. Clearing it on anything else stops a
        // product that was once saved as a service keeping a stale "walk in".
        listing.setServiceMode(listing.getType() == ListingType.SERVICE
                ? ServiceMode.parse(request.serviceMode())
                : null);
        listing.setQuantity(request.quantity());
        listing.setPickupWindow(blankToNull(request.pickupWindow()));

        listing.getDietaryTags().clear();
        if (request.dietaryTags() != null) {
            request.dietaryTags().stream()
                    .filter(tag -> tag != null && !tag.isBlank())
                    .map(String::trim)
                    .forEach(listing.getDietaryTags()::add);
        }

        if (request.images() != null) {
            listing.getImages().clear();
            request.images().stream()
                    .filter(url -> url != null && !url.isBlank())
                    .forEach(listing::addImage);
        }
    }

    /** Sold listings accept description and nothing else that could mislead. */
    private void applySoldListingEdits(Listing listing, SaveListingRequest request) {
        boolean priceChanged = request.price() != null
                && listing.getPrice().compareTo(request.price()) != 0;
        boolean photosChanged = request.images() != null
                && request.images().size() != listing.getImages().size();

        if (priceChanged || photosChanged) {
            throw ApiException.badRequest("SOLD_LISTING_LOCKED",
                    "A sold listing's price and photos are locked. You can still update the description.");
        }
        if (request.description() != null) {
            listing.setDescription(request.description().trim());
        }
    }

    /** Publish-time validation. Drafts are intentionally exempt (workflow 6). */
    private void validateForStatus(Listing listing) {
        if (listing.getStatus() == ListingStatus.DRAFT) {
            return;
        }
        if (listing.getImages().isEmpty()) {
            throw ApiException.badRequest("MISSING_PHOTOS", "Add at least one photo before publishing.");
        }
        switch (listing.getType()) {
            case PRODUCT -> {
                if (listing.getCondition() == null) {
                    throw ApiException.badRequest("MISSING_CONDITION",
                            "Select the item's condition.");
                }
            }
            case SERVICE -> {
                if (listing.getRateType() == null) {
                    throw ApiException.badRequest("MISSING_RATE_TYPE",
                            "Choose how you charge for this service.");
                }
            }
            case FOOD -> {
                if (listing.getQuantity() == null || listing.getQuantity() < 1) {
                    throw ApiException.badRequest("MISSING_QUANTITY",
                            "Enter how many servings are available.");
                }
                if (listing.getPickupWindow() == null) {
                    throw ApiException.badRequest("MISSING_PICKUP_WINDOW",
                            "Enter a pickup window.");
                }
            }
        }
    }

    /**
     * Feed ordering. Every option carries {@code createdAt} as a tiebreaker so
     * paging stays stable - without it, rows sharing a price can shuffle between
     * pages and infinite scroll shows duplicates or drops items.
     *
     * <p>There is deliberately no "nearby" option: listings store a free-text
     * location and users have no coordinates, so proximity cannot actually be
     * computed. Offering it would just be a sort that silently does nothing.
     *
     * <p>"relevance" is absent here on purpose - it is not expressible as a
     * property sort and is applied as an ordering specification instead. See
     * {@link ListingSpecifications#orderByRelevance}.
     */
    private Sort resolveSort(String sort) {
        Sort newest = Sort.by(Sort.Direction.DESC, "createdAt");
        if (sort == null || sort.isBlank()) {
            return newest;
        }
        return switch (sort.trim().toLowerCase()) {
            case "price_asc" -> Sort.by(Sort.Order.asc("price"), Sort.Order.desc("createdAt"));
            case "price_desc" -> Sort.by(Sort.Order.desc("price"), Sort.Order.desc("createdAt"));
            // Views are counted on every detail open, so this is a real measure
            // of what the campus is actually looking at rather than a proxy.
            case "popular" -> Sort.by(Sort.Order.desc("viewsCount"), Sort.Order.desc("createdAt"));
            default -> newest;
        };
    }

    private Specification<Listing> and(Specification<Listing> base, Specification<Listing> extra) {
        return extra == null ? base : base.and(extra);
    }

    private ListingStatus parseStatusForSave(String raw) {
        if (raw == null || raw.isBlank()) {
            return ListingStatus.ACTIVE;
        }
        ListingStatus status = parseStatus(raw);
        return status == ListingStatus.SOLD ? ListingStatus.ACTIVE : status;
    }

    private ListingStatus parseStatus(String raw) {
        try {
            return ListingStatus.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown status: " + raw);
        }
    }

    private ListingType parseType(String raw) {
        try {
            return ListingType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown listing type: " + raw);
        }
    }

    /** Null is allowed - a draft may not have picked a zone yet. */
    private CampusZone parseCampusZone(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return CampusZone.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_ZONE",
                    "Choose Downschool, Upschool or Across.");
        }
    }

    private ListingCondition parseCondition(String raw) {
        if (raw == null || raw.isBlank() || "N/A".equalsIgnoreCase(raw)) {
            return null;
        }
        try {
            return ListingCondition.valueOf(raw.trim().toUpperCase().replace(' ', '_').replace('-', '_'));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown condition: " + raw);
        }
    }

    private RateType parseRateType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return RateType.valueOf(raw.trim().toUpperCase().replace(' ', '_').replace('-', '_'));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown rate type: " + raw);
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
