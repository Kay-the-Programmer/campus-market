package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ListingDtos.CategoryDto;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.dto.ListingDtos.ListingRefDto;
import com.campusmarket.web.dto.ModerationDtos.AuditLogDto;
import com.campusmarket.web.dto.UserDtos.PrivateContactDto;
import com.campusmarket.web.dto.UserDtos.PublicUserDto;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Builds API responses from entities.
 *
 * <p>This is the only place contact details can enter a response body, which is
 * what makes RBAC rule 8 auditable: sensitive fields are omitted from the payload
 * entirely rather than sent and hidden by the UI.
 */
@Component
public class DtoMapper {

    /**
     * Contact details are visible to the account owner and to admins only.
     *
     * <p>The spec says to default to the most restrictive reading where a case is
     * not spelled out, so ordinary logged-in customers viewing another member's
     * profile do not receive email, phone or address - only guests were filtered
     * in the previous implementation, which leaked to every signed-in user.
     */
    private boolean canSeeContactDetails(User target, Principal viewer) {
        return viewer != null
                && viewer.isAuthenticated()
                && (viewer.owns(target.getId()) || viewer.isAdmin());
    }

    public PublicUserDto user(User user, Principal viewer) {
        if (user == null) {
            return null;
        }
        PrivateContactDto contact = canSeeContactDetails(user, viewer)
                ? new PrivateContactDto(user.getEmail(), user.getPhone(), user.getPrivateAddress())
                : null;

        return new PublicUserDto(
                user.getId(),
                user.getName(),
                user.getAvatarUrl(),
                user.isVerified(),
                user.getDepartment(),
                user.getYear(),
                user.getRatingAvg(),
                user.getReviewsCount(),
                user.getCreatedAt(),
                user.getBio(),
                user.getStatus().name(),
                contact);
    }

    public CategoryDto category(Category category, long listingCount) {
        if (category == null) {
            return null;
        }
        Category parent = category.getParent();
        return new CategoryDto(
                category.getId(),
                category.getName(),
                category.getSlug(),
                category.getIcon(),
                parent == null ? null : parent.getId(),
                parent == null ? null : parent.getName(),
                category.getSortOrder(),
                listingCount);
    }

    public ListingDto listing(Listing listing, Principal viewer, Set<UUID> savedListingIds) {
        List<String> imageUrls = listing.getImages().stream()
                .map(ListingImage::getUrl)
                .toList();

        return new ListingDto(
                listing.getId(),
                listing.getType().name(),
                listing.getTitle(),
                listing.getDescription(),
                listing.getPrice(),
                listing.getPriceUnit(),
                category(listing.getCategory(), 0),
                listing.getLocation(),
                listing.getCampusZone() == null ? null : listing.getCampusZone().name(),
                listing.getStatus().name(),
                listing.getCondition() == null ? null : listing.getCondition().name(),
                listing.getBrand(),
                listing.getAvailability(),
                listing.getRateType() == null ? null : listing.getRateType().name(),
                listing.getServiceMode() == null ? null : listing.getServiceMode().name(),
                listing.getQuantity(),
                listing.getPickupWindow(),
                Set.copyOf(listing.getDietaryTags()),
                imageUrls,
                user(listing.getSeller(), viewer),
                listing.getViewsCount(),
                savedListingIds != null && savedListingIds.contains(listing.getId()),
                isPurchasable(listing),
                listing.isSpecialOffer(),
                listing.getCompareAtPrice(),
                Listings.availableStock(listing),
                discountPercent(listing),
                listing.getCreatedAt());
    }

    /**
     * Whole-percent saving against the compare-at price.
     *
     * <p>Computed here rather than in the browser so every surface quotes the
     * same number, and returns null unless the comparison is real: no
     * compare-at price, or one at or below the asking price, is not a discount
     * and must not be dressed up as one.
     */
    private Integer discountPercent(Listing listing) {
        BigDecimal was = listing.getCompareAtPrice();
        BigDecimal now = listing.getPrice();
        if (was == null || now == null
                || was.signum() <= 0
                || was.compareTo(now) <= 0) {
            return null;
        }
        return was.subtract(now)
                .multiply(BigDecimal.valueOf(100))
                .divide(was, 0, RoundingMode.HALF_UP)
                .intValue();
    }

    /**
     * Soft-deleted listings still resolve here so chat threads and deal history
     * render "Listing removed" rather than a broken reference (workflow 8).
     */
    public ListingRefDto listingRef(Listing listing) {
        if (listing == null) {
            return null;
        }
        String image = listing.getImages().isEmpty() ? null : listing.getImages().get(0).getUrl();
        return new ListingRefDto(
                listing.getId(),
                listing.isDeleted() ? "Listing removed" : listing.getTitle(),
                listing.getPrice(),
                listing.isDeleted() ? null : image,
                listing.getStatus().name(),
                listing.isDeleted(),
                Listings.availableStock(listing));
    }

    public AuditLogDto auditLog(AuditLog log) {
        return new AuditLogDto(
                log.getId(),
                log.getAdmin().getId(),
                log.getAdmin().getName(),
                log.getAction().name(),
                log.getTargetType(),
                log.getTargetId(),
                log.getReason(),
                log.getDetails(),
                log.getCreatedAt());
    }

    /** Purchasable right now - reserved and sold items are not. */
    public boolean isPurchasable(Listing listing) {
        return !listing.isDeleted() && listing.getStatus() == ListingStatus.ACTIVE;
    }
}
