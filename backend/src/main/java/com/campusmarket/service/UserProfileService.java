package com.campusmarket.service;

import com.campusmarket.domain.CampusZone;
import com.campusmarket.domain.DealStatus;
import com.campusmarket.domain.ListingStatus;
import com.campusmarket.domain.User;
import com.campusmarket.repository.DealRepository;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.SavedListingRepository;
import com.campusmarket.repository.UserRepository;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.dto.UserDtos.SellerStatsDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Public and own profile pages. */
@Service
@RequiredArgsConstructor
public class UserProfileService {

    private static final List<ListingStatus> LIVE =
            List.of(ListingStatus.ACTIVE, ListingStatus.RESERVED);

    private final UserRepository userRepository;
    private final ListingRepository listingRepository;
    private final DealRepository dealRepository;
    private final SavedListingRepository savedListingRepository;
    private final DtoMapper mapper;

    /**
     * Edit your own profile.
     *
     * <p>Scoped to the caller's own id and never takes one from the request:
     * "update the profile" has exactly one legitimate target, and accepting an
     * id would turn this into an account-takeover endpoint one bug away.
     *
     * <p>The phone number is deliberately NOT settable here. It changes only
     * through {@link PhoneVerificationService}, so a number on a profile has
     * always been confirmed by whoever holds it.
     */
    @Transactional
    public Map<String, Object> updateOwnProfile(Principal principal,
                                                String name,
                                                String bio,
                                                String department,
                                                String year,
                                                String campusZone,
                                                String avatarUrl,
                                                String privateAddress) {
        if (principal.isGuest()) {
            throw ApiException.unauthorized("Please log in to edit your profile.");
        }
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        String cleanName = name == null ? null : name.trim();
        if (cleanName == null || cleanName.isBlank()) {
            throw ApiException.badRequest("NAME_REQUIRED", "Your name cannot be empty.");
        }
        if (cleanName.length() > 80) {
            throw ApiException.badRequest("NAME_TOO_LONG", "That name is too long.");
        }

        user.setName(cleanName);
        user.setBio(blankToNull(bio));
        user.setDepartment(blankToNull(department));
        user.setYear(blankToNull(year));
        user.setAvatarUrl(blankToNull(avatarUrl));
        user.setPrivateAddress(blankToNull(privateAddress));

        if (campusZone != null && !campusZone.isBlank()) {
            try {
                user.setCampusZone(CampusZone.valueOf(campusZone.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("INVALID_ZONE", "Choose one of the campus zones.");
            }
        }

        userRepository.save(user);
        return getProfile(principal, user.getId());
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getProfile(Principal principal, UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found."));

        boolean isSelf = principal.owns(userId);

        Set<UUID> saved = principal.isGuest() || principal.isAdmin()
                ? Set.of()
                : savedListingRepository.findListingIdsByUserId(principal.id());

        // Only live listings on someone else's profile; the owner sees drafts and
        // sold items too, on their own page.
        List<ListingDto> listings = listingRepository
                .findBySellerIdAndDeletedFalseOrderByCreatedAtDesc(userId).stream()
                .filter(listing -> isSelf || principal.isAdmin() || listing.isPubliclyVisible())
                .map(listing -> mapper.listing(listing, principal, saved))
                .toList();

        SellerStatsDto stats = new SellerStatsDto(
                listingRepository.countBySellerIdAndDeletedFalseAndStatusIn(userId, LIVE),
                listingRepository.countBySellerIdAndDeletedFalseAndStatusIn(userId, List.of(ListingStatus.SOLD)),
                dealRepository.countForUserWithStatus(userId, DealStatus.COMPLETED),
                user.getRatingAvg(),
                user.getReviewsCount());

        Map<String, Object> body = new LinkedHashMap<>();
        // mapper.user decides whether contact details are included at all.
        body.put("user", mapper.user(user, principal));
        body.put("stats", stats);
        body.put("listings", listings);
        body.put("isSelf", isSelf);
        return body;
    }
}
