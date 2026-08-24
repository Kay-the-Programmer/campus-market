package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.DealService;
import com.campusmarket.web.dto.CommerceDtos.DealDto;
import com.campusmarket.web.dto.CommerceDtos.ReviewDto;
import com.campusmarket.web.dto.UserDtos.PublicUserDto;
import com.campusmarket.web.request.CommerceRequests.ReviewRequest;
import com.campusmarket.web.request.ListingRequests.MarkSoldRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class DealController {

    private final DealService dealService;

    /** Buyer picker for Mark as Sold when it is not launched from a chat thread. */
    @GetMapping("/api/listings/{id}/buyers")
    public Map<String, List<PublicUserDto>> candidateBuyers(@AuthPrincipal Principal principal,
                                                            @PathVariable UUID id) {
        return Map.of("buyers", dealService.candidateBuyers(principal, id));
    }

    @PostMapping("/api/listings/{id}/mark-sold")
    public Map<String, Object> markSold(@AuthPrincipal Principal principal,
                                        @PathVariable UUID id,
                                        @Valid @RequestBody MarkSoldRequest request) {
        DealDto deal = dealService.markSold(principal, id, request);
        return Map.of("success", true, "deal", deal);
    }

    @GetMapping("/api/deals")
    public Map<String, List<DealDto>> deals(@AuthPrincipal Principal principal) {
        return Map.of("deals", dealService.listDeals(principal));
    }

    @PostMapping("/api/deals/{id}/review")
    public Map<String, Object> review(@AuthPrincipal Principal principal,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody ReviewRequest request) {
        ReviewDto review = dealService.submitReview(principal, id, request.rating(), request.comment());
        return Map.of("success", true, "review", review);
    }

    @GetMapping("/api/users/{id}/reviews")
    public Map<String, List<ReviewDto>> reviews(@AuthPrincipal Principal principal,
                                                @PathVariable UUID id) {
        return Map.of("reviews", dealService.reviewsFor(principal, id));
    }

    /** Reviews of one listing, plus their count and average. */
    @GetMapping("/api/listings/{id}/reviews")
    public Map<String, Object> listingReviews(@AuthPrincipal Principal principal,
                                              @PathVariable UUID id) {
        return dealService.reviewsForListing(principal, id);
    }
}
