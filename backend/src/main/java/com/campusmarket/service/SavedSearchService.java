package com.campusmarket.service;

import com.campusmarket.domain.Category;
import com.campusmarket.domain.SavedSearch;
import com.campusmarket.repository.CategoryRepository;
import com.campusmarket.repository.SavedSearchRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.util.Money;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The searches someone is waiting on.
 *
 * <p>Deliberately small. A saved search is a handful of filters and a switch;
 * everything interesting happens in {@link SavedSearchNotifier}, which decides
 * whether a newly published listing satisfies one.
 */
@Service
@RequiredArgsConstructor
public class SavedSearchService {

    /**
     * How many searches one account may keep.
     *
     * <p>A cap rather than unlimited because every saved search is work done on
     * the path that publishes a listing, and because someone with forty alerts
     * is not being served by any of them.
     */
    private static final int MAX_PER_USER = 20;

    private final SavedSearchRepository savedSearchRepository;
    private final CategoryRepository categoryRepository;
    private final AccessGuard accessGuard;

    @Transactional(readOnly = true)
    public List<SavedSearch> list(Principal principal) {
        accessGuard.requireAuthenticated(principal);
        return savedSearchRepository.findByUserIdOrderByCreatedAtDesc(principal.id());
    }

    @Transactional
    public SavedSearch create(Principal principal,
                              String query,
                              String type,
                              UUID categoryId,
                              String campusZone,
                              BigDecimal minPrice,
                              BigDecimal maxPrice,
                              String label) {
        accessGuard.requireAuthenticated(principal);

        boolean hasQuery = query != null && !query.isBlank();
        boolean hasFilter = type != null || categoryId != null || campusZone != null
                || minPrice != null || maxPrice != null;
        if (!hasQuery && !hasFilter) {
            // A search with no terms and no filters is "everything", and an
            // alert on everything is just a notification per listing.
            throw ApiException.badRequest("EMPTY_SEARCH",
                    "Add a search term or a filter before saving this.");
        }
        if (savedSearchRepository.countByUserId(principal.id()) >= MAX_PER_USER) {
            throw ApiException.badRequest("TOO_MANY_SEARCHES",
                    "You can keep " + MAX_PER_USER + " saved searches. Delete one to add another.");
        }

        Category category = null;
        if (categoryId != null) {
            category = categoryRepository.findById(categoryId)
                    .orElseThrow(() -> ApiException.badRequest("Unknown category."));
        }

        SavedSearch search = new SavedSearch();
        search.setUser(principal.user());
        search.setQuery(hasQuery ? query.trim() : null);
        search.setType(blankToNull(type));
        search.setCategory(category);
        search.setCampusZone(blankToNull(campusZone));
        search.setMinPrice(minPrice);
        search.setMaxPrice(maxPrice);
        search.setLabel(label != null && !label.isBlank()
                ? label.trim()
                : describe(query, type, category, campusZone, minPrice, maxPrice));

        try {
            /*
             * saveAndFlush, not save.
             *
             * `save` only queues the insert; the unique index does not reject
             * anything until the transaction commits, which is long after this
             * catch block has gone out of scope. The duplicate then escaped as
             * a generic INTERNAL_ERROR, so saving the same search twice told
             * the person something had broken rather than that they were
             * already watching it. Flushing here puts the violation inside the
             * try, where it can be turned into an answer.
             */
            return savedSearchRepository.saveAndFlush(search);
        } catch (DataIntegrityViolationException e) {
            // Saving the same filters twice is a mis-tap, not a failure.
            throw ApiException.badRequest("ALREADY_SAVED", "You have already saved this search.");
        }
    }

    @Transactional
    public SavedSearch setNotify(Principal principal, UUID id, boolean notify) {
        accessGuard.requireAuthenticated(principal);
        SavedSearch search = savedSearchRepository.findByIdAndUserId(id, principal.id())
                .orElseThrow(() -> ApiException.notFound("That saved search no longer exists."));
        search.setNotify(notify);
        return savedSearchRepository.save(search);
    }

    @Transactional
    public void delete(Principal principal, UUID id) {
        accessGuard.requireAuthenticated(principal);
        SavedSearch search = savedSearchRepository.findByIdAndUserId(id, principal.id())
                .orElseThrow(() -> ApiException.notFound("That saved search no longer exists."));
        savedSearchRepository.delete(search);
    }

    /**
     * A readable name for an unnamed search.
     *
     * <p>Built from the filters themselves, so the list reads as a set of
     * intentions - "Textbooks under K200" - rather than "Saved search 3". The
     * person can rename it, but they should not have to just to recognise it.
     */
    private String describe(String query, String type, Category category, String zone,
                            BigDecimal min, BigDecimal max) {
        List<String> parts = new ArrayList<>();
        if (query != null && !query.isBlank()) {
            parts.add("\"" + query.trim() + "\"");
        }
        if (category != null) {
            parts.add(category.getName());
        } else if (type != null && !type.isBlank()) {
            String t = type.trim().toLowerCase();
            parts.add(Character.toUpperCase(t.charAt(0)) + t.substring(1) + "s");
        }
        if (min != null && max != null) {
            parts.add(Money.format(min) + " to " + Money.format(max));
        } else if (max != null) {
            parts.add("under " + Money.format(max));
        } else if (min != null) {
            parts.add("over " + Money.format(min));
        }
        if (zone != null && !zone.isBlank()) {
            parts.add("in " + zone.trim().toLowerCase());
        }
        return parts.isEmpty() ? "Saved search" : String.join(" · ", parts);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
