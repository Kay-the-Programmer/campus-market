package com.campusmarket.service;

import com.campusmarket.domain.Listing;
import com.campusmarket.domain.SavedListing;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.SavedListingRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Workflow 11: save / unsave a listing. */
@Service
@RequiredArgsConstructor
public class SavedListingService {

    private final SavedListingRepository savedListingRepository;
    private final ListingRepository listingRepository;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    @Transactional(readOnly = true)
    public List<ListingDto> list(Principal principal) {
        accessGuard.requireCustomer(principal);
        Set<UUID> savedIds = savedListingRepository.findListingIdsByUserId(principal.id());

        // Deliberately resolves sold and removed listings too. Dropping them would
        // make saved items vanish silently; instead they come back flagged
        // unavailable so the UI can label them (workflow 11).
        return savedListingRepository.findByUserIdOrderByCreatedAtDesc(principal.id()).stream()
                .map(saved -> listingRepository.findById(saved.getListingId()).orElse(null))
                .filter(java.util.Objects::nonNull)
                .map(listing -> mapper.listing(listing, principal, savedIds))
                .toList();
    }

    @Transactional
    public Map<String, Object> toggle(Principal principal, UUID listingId) {
        accessGuard.requireCustomer(principal);

        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> ApiException.notFound("Listing not found."));

        boolean nowSaved;
        if (savedListingRepository.existsByUserIdAndListingId(principal.id(), listingId)) {
            savedListingRepository.deleteByUserIdAndListingId(principal.id(), listingId);
            nowSaved = false;
        } else {
            savedListingRepository.save(new SavedListing(principal.id(), listing.getId()));
            nowSaved = true;
        }

        return Map.of("success", true, "saved", nowSaved);
    }
}
