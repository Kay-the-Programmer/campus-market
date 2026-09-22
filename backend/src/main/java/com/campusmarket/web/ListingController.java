package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.ListingService;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.dto.ListingDtos.PageDto;
import com.campusmarket.web.dto.ListingDtos.SuggestionsDto;
import com.campusmarket.web.request.ListingRequests.SaveListingRequest;
import com.campusmarket.web.request.ListingRequests.StatusChangeRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ListingController {

    private final ListingService listingService;

    /** Public - guests browse freely (RBAC matrix: Browse/Feed is Full for all). */
    @GetMapping("/api/listings")
    public PageDto<ListingDto> search(@AuthPrincipal Principal principal,
                                      @RequestParam(required = false) String search,
                                      @RequestParam(required = false) String type,
                                      @RequestParam(required = false) UUID categoryId,
                                      @RequestParam(required = false) BigDecimal minPrice,
                                      @RequestParam(required = false) BigDecimal maxPrice,
                                      @RequestParam(required = false) String condition,
                                      @RequestParam(required = false) String location,
                                      @RequestParam(required = false) String campusZone,
                                      @RequestParam(required = false) UUID sellerId,
                                      @RequestParam(required = false) String sort,
                                      @RequestParam(required = false) Boolean specialOffer,
                                      @RequestParam(required = false) Boolean hasDiscount,
                                      @RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "24") int size) {
        return listingService.search(principal, search, type, categoryId, minPrice, maxPrice,
                condition, location, campusZone, sellerId, sort, specialOffer, hasDiscount,
                page, size);
    }

    /**
     * What the campus is looking at this week.
     *
     * <p>Public, like browse. Returns an empty list rather than a short one
     * when nothing clears {@code minViews} - a shelf headed "Trending" over
     * three views is a claim the data does not support, and the client renders
     * no shelf at all in that case.
     */
    @GetMapping("/api/listings/trending")
    public Map<String, List<ListingDto>> trending(@AuthPrincipal Principal principal,
                                                  @RequestParam(defaultValue = "8") int limit,
                                                  @RequestParam(defaultValue = "7") int windowDays,
                                                  @RequestParam(defaultValue = "3") int minViews) {
        return Map.of("listings", listingService.trending(principal, limit, windowDays, minViews));
    }

    /** Public search-as-you-type. Runs on every keystroke, so it stays cheap. */
    @GetMapping("/api/listings/suggestions")
    public SuggestionsDto suggestions(@RequestParam(required = false) String q,
                                      @RequestParam(defaultValue = "6") int limit) {
        return listingService.suggest(q, limit);
    }

    @GetMapping("/api/listings/{id}")
    public Map<String, Object> getOne(@AuthPrincipal Principal principal, @PathVariable UUID id) {
        return Map.of("listing", listingService.getById(principal, id));
    }

    @PostMapping("/api/listings")
    public ResponseEntity<Map<String, Object>> create(@AuthPrincipal Principal principal,
                                                      @Valid @RequestBody SaveListingRequest request) {
        ListingDto listing = listingService.create(principal, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "listing", listing));
    }

    @PutMapping("/api/listings/{id}")
    public Map<String, Object> update(@AuthPrincipal Principal principal,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody SaveListingRequest request) {
        return Map.of("success", true, "listing", listingService.update(principal, id, request));
    }

    @PostMapping("/api/listings/{id}/status")
    public Map<String, Object> changeStatus(@AuthPrincipal Principal principal,
                                            @PathVariable UUID id,
                                            @Valid @RequestBody StatusChangeRequest request) {
        return Map.of("success", true, "listing", listingService.changeStatus(principal, id, request));
    }

    /**
     * Soft delete. Pass {@code ?confirm=true} to proceed once the caller has
     * acknowledged the active-conversation warning (workflow 8).
     */
    @DeleteMapping("/api/listings/{id}")
    public Map<String, Object> delete(@AuthPrincipal Principal principal,
                                      @PathVariable UUID id,
                                      @RequestParam(defaultValue = "false") boolean confirm) {
        return listingService.delete(principal, id, confirm);
    }

    @GetMapping("/api/my-listings")
    public Map<String, List<ListingDto>> myListings(@AuthPrincipal Principal principal) {
        return Map.of("listings", listingService.myListings(principal));
    }
}
