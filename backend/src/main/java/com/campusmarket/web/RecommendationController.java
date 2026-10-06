package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.RecommendationService;
import com.campusmarket.service.recommend.TasteProfile;
import com.campusmarket.web.dto.ListingDtos.CategoryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The two recommendations that are not the feed: what else to show under a
 * listing, and where to browse next.
 *
 * <p>The feed itself is {@code GET /api/listings?sort=foryou}, because it has
 * to carry every filter browse already has and a second endpoint would be the
 * same search with a different name.
 *
 * <p>All of it is public. Recommendations for a guest are built from the
 * listing they are on and whatever their own device sends as {@code recent} -
 * which is the whole reason these take that parameter.
 */
@RestController
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendations;

    /**
     * What the people who opened this listing went on to open.
     *
     * <p>Distinct from the similar listings the page already shows, and
     * labelled distinctly: the response says what the picks were based on, so
     * the client can head the row "People also viewed" when that is true and
     * fall back to "More in this category" when it is not.
     */
    @GetMapping("/api/listings/{id}/suggested")
    public Map<String, Object> suggested(@AuthPrincipal Principal principal,
                                         @PathVariable UUID id,
                                         @RequestParam(defaultValue = "8") int limit) {
        RecommendationService.Suggested suggested =
                recommendations.alsoViewed(principal, id, limit);
        return Map.of("listings", suggested.listings(), "basis", suggested.basis());
    }

    /**
     * Where this person might want to browse next.
     *
     * @param recent listing ids from the caller's own device, for a guest who
     *   has no history on this side. Capped by the service.
     */
    @GetMapping("/api/recommendations/categories")
    public Map<String, List<CategoryDto>> categories(@AuthPrincipal Principal principal,
                                                     @RequestParam(defaultValue = "6") int limit,
                                                     @RequestParam(required = false) List<UUID> recent) {
        TasteProfile profile = recommendations.profileFor(principal, recent);
        return Map.of("categories", recommendations.suggestedCategories(principal, profile, limit));
    }
}
