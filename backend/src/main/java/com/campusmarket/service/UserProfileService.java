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
     * <p>The phone number is settable here, and was not always.
     *
     * <p>It used to change only through {@link PhoneVerificationService}, so
     * that a number on a profile had always been confirmed by whoever holds
     * it. That is a stronger guarantee and it cost more than it was worth:
     * verification needs the student to send an SMS they pay for, which
     * excludes anyone out of airtime, and with no gateway configured it
     * excluded everyone - leaving the number on a profile uneditable, not
     * merely unverified. A number somebody can correct beats a number nobody
     * can touch.
     *
     * <p>Verification still exists and still sets {@code phoneVerified}; it is
     * now a badge an account can earn rather than the only way to have a
     * number at all. Setting a number here clears that badge, because the new
     * number plainly has not been confirmed.
     */
    @Transactional
    public Map<String, Object> updateOwnProfile(Principal principal,
                                                String name,
                                                String bio,
                                                String department,
                                                String year,
                                                String campusZone,
                                                String avatarUrl,
                                                String privateAddress,
                                                String phone) {
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

        /*
         * Only when the caller actually sent one. A null means "not editing
         * the phone" - every other field here is sent on every save, but
         * treating a missing phone as "clear it" would wipe the number of any
         * older client, and the number is now required at registration.
         */
        if (phone != null) {
            String cleanPhone = blankToNull(phone);
            if (cleanPhone == null) {
                throw ApiException.badRequest("PHONE_REQUIRED",
                        "Add a phone number so you can be reached at a handover.");
            }
            String normalised = PhoneVerificationService.normalise(cleanPhone);
            if (normalised == null) {
                throw ApiException.badRequest("PHONE_INVALID",
                        "That phone number does not look right. Check the digits and try again.");
            }
            // A changed number is an unverified number - the badge belongs to
            // the line that was confirmed, not to the account.
            if (!normalised.equals(user.getPhone())) {
                user.setPhone(normalised);
                user.setPhoneVerified(false);
            }
        }

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
