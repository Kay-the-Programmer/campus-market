package com.campusmarket.web;

import com.campusmarket.domain.SavedSearch;
import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.SavedSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class SavedSearchController {

    private final SavedSearchService savedSearchService;

    /**
     * The shape the client sees.
     *
     * <p>A record rather than the entity: {@code SavedSearch} holds a lazy User
     * and a lazy Category, and serialising it directly would either leak the
     * owner's details or fail on a detached proxy.
     */
    public record SavedSearchDto(
            UUID id,
            String label,
            String query,
            String type,
            UUID categoryId,
            String categoryName,
            String campusZone,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            /* Named "alerts", not "notify": a record component cannot be called
               notify - it collides with Object.notify() and the compiler
               rejects it outright. The wire field follows the component name. */
            boolean alerts,
            Instant createdAt
    ) {
        static SavedSearchDto of(SavedSearch s) {
            return new SavedSearchDto(
                    s.getId(),
                    s.getLabel(),
                    s.getQuery(),
                    s.getType(),
                    s.getCategory() == null ? null : s.getCategory().getId(),
                    s.getCategory() == null ? null : s.getCategory().getName(),
                    s.getCampusZone(),
                    s.getMinPrice(),
                    s.getMaxPrice(),
                    s.isNotify(),
                    s.getCreatedAt());
        }
    }

    public record CreateSavedSearchRequest(
            String query,
            String type,
            UUID categoryId,
            String campusZone,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            /** Optional. The service names it from the filters when absent. */
            String label
    ) {}

    public record AlertsRequest(boolean alerts) {}

    @GetMapping("/api/saved-searches")
    public Map<String, List<SavedSearchDto>> list(@AuthPrincipal Principal principal) {
        return Map.of("searches", savedSearchService.list(principal).stream()
                .map(SavedSearchDto::of)
                .toList());
    }

    @PostMapping("/api/saved-searches")
    public ResponseEntity<Map<String, Object>> create(@AuthPrincipal Principal principal,
                                                      @RequestBody CreateSavedSearchRequest body) {
        SavedSearch saved = savedSearchService.create(principal, body.query(), body.type(),
                body.categoryId(), body.campusZone(), body.minPrice(), body.maxPrice(), body.label());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "search", SavedSearchDto.of(saved)));
    }

    @PostMapping("/api/saved-searches/{id}/alerts")
    public Map<String, Object> setNotify(@AuthPrincipal Principal principal,
                                         @PathVariable UUID id,
                                         @RequestBody AlertsRequest body) {
        return Map.of("success", true,
                "search", SavedSearchDto.of(savedSearchService.setNotify(principal, id, body.alerts())));
    }

    @DeleteMapping("/api/saved-searches/{id}")
    public Map<String, Object> delete(@AuthPrincipal Principal principal, @PathVariable UUID id) {
        savedSearchService.delete(principal, id);
        return Map.of("success", true);
    }
}
