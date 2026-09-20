package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.*;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.CommerceDtos.DealDto;
import com.campusmarket.web.dto.CommerceDtos.ReviewDto;
import com.campusmarket.web.dto.UserDtos.PublicUserDto;
import com.campusmarket.web.error.ApiException;
import com.campusmarket.web.request.ListingRequests.MarkSoldRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Workflows 9 and 16: closing a sale into a deal, and reviewing it afterwards. */
@Service
@RequiredArgsConstructor
public class DealService {

    private final DealRepository dealRepository;
    private final ListingRepository listingRepository;
    private final UserRepository userRepository;
    private final ReviewRepository reviewRepository;
    private final ConversationRepository conversationRepository;
    private final NotificationService notificationService;
    private final SavedListingNotifier savedListingNotifier;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    // ------------------------------------------------------------ workflow 9
    /** Buyers who have messaged about this listing - populates the buyer picker. */
    @Transactional(readOnly = true)
    public List<PublicUserDto> candidateBuyers(Principal principal, UUID listingId) {
        accessGuard.requireOwnerContext(principal);
        Listing listing = listingRepository.findByIdAndDeletedFalse(listingId)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));
        accessGuard.requireOwner(principal, listing.getSeller().getId(),
                "You can only manage your own listings.");

        return conversationRepository.findByListingId(listingId).stream()
                .map(Conversation::getBuyer)
                .distinct()
                .map(buyer -> mapper.user(buyer, principal))
                .toList();
    }

    @Transactional
    public DealDto markSold(Principal principal, UUID listingId, MarkSoldRequest request) {
        accessGuard.requireOwnerContext(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(listingId)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));
        accessGuard.requireOwner(principal, listing.getSeller().getId(),
                "You can only mark your own listings as sold.");

        UUID sellerId = listing.getSeller().getId();
        if (request.buyerId().equals(sellerId)) {
            throw ApiException.badRequest("You cannot record yourself as the buyer.");
        }

        /*
         * Two chats can reach "confirm sale" at the same moment. The conditional
         * UPDATE is the arbiter: whoever gets the row lock first flips the status
         * and the other sees zero rows affected. Checking-then-writing in Java
         * would let both through (workflow 9).
         */
        int updated = listingRepository.transitionStatus(listingId, ListingStatus.SOLD);
        if (updated == 0) {
            throw ApiException.conflict("ALREADY_SOLD", "This item was already marked as sold.");
        }

        // transitionStatus clears the persistence context, so re-read entities.
        Listing soldListing = listingRepository.findById(listingId)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));
        User seller = userRepository.findById(sellerId)
                .orElseThrow(() -> ApiException.notFound("Seller not found."));
        User buyer = userRepository.findById(request.buyerId())
                .orElseThrow(() -> ApiException.notFound("Buyer not found."));

        Deal deal = new Deal();
        deal.setListing(soldListing);
        deal.setSeller(seller);
        deal.setBuyer(buyer);
        deal.setPrice(request.price());
        deal.setMeetupLocation(request.meetupLocation());
        deal.setMeetupTime(request.meetupTime());
        deal.setStatus(DealStatus.COMPLETED);
        dealRepository.save(deal);

        /*
         * Everyone still waiting on this item finds out it is gone.
         *
         * Placed after the conditional UPDATE above, so it can only run for
         * the caller that actually won the race - the loser threw ALREADY_SOLD
         * and never reaches here. Without that, two simultaneous confirmations
         * would each tell the same watchers the same thing.
         */
        savedListingNotifier.soldOut(soldListing);

        // Only the buyer is prompted to review (workflow 9 step 5) - reviews
        // rate sellers, so sellers never review their buyers.
        String link = "/deals?review=" + deal.getId();
        notificationService.notify(buyer, NotificationType.REVIEW,
                "How did it go with " + seller.getName() + "?",
                "Leave a review for \"" + soldListing.getTitle() + "\".", link);

        return toDealDto(deal, principal, sellerId);
    }

    @Transactional(readOnly = true)
    public List<DealDto> listDeals(Principal principal) {
        // Scoped to the caller's own deals. Admins appear here only for sales
        // they made themselves, now that they may sell.
        accessGuard.requireOwnerContext(principal);
        UUID me = principal.id();
        return dealRepository.findAllForUser(me).stream()
                .map(deal -> toDealDto(deal, principal, me))
                .toList();
    }

    // ----------------------------------------------------------- workflow 16
    @Transactional
    public ReviewDto submitReview(Principal principal, UUID dealId, int rating, String comment) {
        accessGuard.requireCustomer(principal);

        if (rating < 1 || rating > 5) {
            throw ApiException.badRequest("Rating must be between 1 and 5 stars.");
        }

        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> ApiException.notFound("Deal not found."));

        // Only the buyer may review, and only a deal they took part in:
        // reviews rate the seller, so sellers have nothing to leave here.
        if (!deal.involves(principal.id())) {
            throw ApiException.forbidden("You can only review transactions you took part in.");
        }
        if (!deal.getBuyer().getId().equals(principal.id())) {
            throw ApiException.forbidden("Only the buyer can review a transaction.");
        }
        if (deal.getStatus() != DealStatus.COMPLETED) {
            throw ApiException.badRequest("DEAL_NOT_COMPLETE",
                    "You can review this once the deal is complete.");
        }
        if (reviewRepository.existsByDealIdAndReviewerId(dealId, principal.id())) {
            throw ApiException.conflict("ALREADY_REVIEWED",
                    "You've already reviewed this transaction.");
        }

        User reviewer = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("User not found."));
        User reviewee = deal.counterpartyOf(principal.id());

        Review review = new Review();
        review.setDeal(deal);
        review.setReviewer(reviewer);
        review.setReviewee(reviewee);
        review.setRating(rating);
        review.setComment(comment == null || comment.isBlank() ? null : comment.trim());
        reviewRepository.save(review);
        reviewRepository.flush();

        recalculateRating(reviewee);

        notificationService.notify(reviewee, NotificationType.REVIEW,
                "New review from " + reviewer.getName(),
                rating + "-star review received.",
                "/profile/" + reviewee.getId());

        return toReviewDto(review, principal);
    }

    @Transactional(readOnly = true)
    public List<ReviewDto> reviewsFor(Principal principal, UUID userId) {
        return reviewRepository.findByRevieweeIdOrderByCreatedAtDesc(userId).stream()
                .map(review -> toReviewDto(review, principal))
                .toList();
    }

    /**
     * Reviews of a particular listing, with their summary.
     *
     * <p>Distinct from a seller's rating, and more useful for the things people
     * buy repeatedly: a printing service or a tutor accumulates handovers of
     * the same listing, and "four people used this" answers a question the
     * seller's overall stars do not.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> reviewsForListing(Principal principal, UUID listingId) {
        List<ReviewDto> reviews = reviewRepository
                .findAboutListing(listingId).stream()
                .map(review -> toReviewDto(review, principal))
                .toList();

        Double average = reviewRepository.averageRatingForListing(listingId);
        long count = reviewRepository.countForListing(listingId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reviews", reviews);
        body.put("count", count);
        // Null rather than 0 when nobody has reviewed: "0 stars" and "not yet
        // rated" mean opposite things to a buyer deciding whether to trust it.
        body.put("average", count == 0 || average == null
                ? null
                : BigDecimal.valueOf(average).setScale(1, RoundingMode.HALF_UP));
        return body;
    }

    /** Recomputed from the stored reviews rather than incremented, so it cannot drift. */
    private void recalculateRating(User reviewee) {
        Double average = reviewRepository.averageRatingFor(reviewee.getId());
        long count = reviewRepository.countByRevieweeId(reviewee.getId());
        reviewee.setRatingAvg(BigDecimal.valueOf(average == null ? 0 : average)
                .setScale(2, RoundingMode.HALF_UP));
        reviewee.setReviewsCount((int) count);
    }

    private DealDto toDealDto(Deal deal, Principal principal, UUID viewerId) {
        boolean isBuyer = deal.getBuyer().getId().equals(viewerId);
        return new DealDto(
                deal.getId(),
                mapper.listingRef(deal.getListing()),
                mapper.user(deal.counterpartyOf(viewerId), principal),
                isBuyer ? "buyer" : "seller",
                deal.getPrice(),
                deal.getMeetupLocation(),
                deal.getMeetupTime(),
                deal.getStatus().name(),
                reviewRepository.existsByDealIdAndReviewerId(deal.getId(), viewerId),
                deal.getCreatedAt());
    }

    private ReviewDto toReviewDto(Review review, Principal principal) {
        return new ReviewDto(
                review.getId(),
                review.getDeal().getId(),
                mapper.user(review.getReviewer(), principal),
                review.getReviewee().getId(),
                review.getRating(),
                review.getComment(),
                review.getCreatedAt());
    }
}
