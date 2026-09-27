package com.campusmarket.service;

import com.campusmarket.domain.AuditAction;
import com.campusmarket.domain.PromoPlacement;
import com.campusmarket.domain.PromoSlot;
import com.campusmarket.domain.PromoTheme;
import com.campusmarket.repository.PromoSlotRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.PromoDtos.PromoSlotDto;
import com.campusmarket.web.error.ApiException;
import com.campusmarket.web.request.PromoRequests.SavePromoRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The editable promo panels: hero carousel slides, "Special offers" tiles and
 * the call-to-action banners on the browse pages.
 *
 * <p>Reading is public because the feed renders before anyone signs in. Every
 * write is admin-only and audited, exactly like the category taxonomy.
 */
@Service
@RequiredArgsConstructor
public class PromoService {

    /**
     * The upload flow always produces a short {@code /api/uploads/...} URL, so
     * this now only guards the other accepted shape: an admin pasting a direct
     * image link by hand, where nothing stops them pasting something absurd.
     */
    private static final int MAX_IMAGE_CHARS = 900_000;

    /** What the banner layout draws. Anything past this is weight nobody sees. */
    private static final int MAX_COLLAGE_IMAGES = 6;

    private final PromoSlotRepository promoSlotRepository;
    private final AccessGuard accessGuard;
    private final AuditService auditService;

    // -------------------------------------------------------------- public
    /** Public - no principal, no guard. Inactive slots never leave the server. */
    @Transactional(readOnly = true)
    public List<PromoSlotDto> listActive() {
        return promoSlotRepository.findByActiveTrueOrderByPlacementAscSortOrderAsc()
                .stream().map(this::toDto).toList();
    }

    // --------------------------------------------------------------- admin
    @Transactional(readOnly = true)
    public List<PromoSlotDto> listAll(Principal principal) {
        accessGuard.requireAdmin(principal);
        return promoSlotRepository.findAllByOrderByPlacementAscSortOrderAsc()
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public PromoSlotDto create(Principal principal, SavePromoRequest request) {
        accessGuard.requireAdmin(principal);

        PromoSlot slot = new PromoSlot();
        apply(slot, request);

        // New panels land at the end of their section rather than jumping to
        // the front of a running campaign.
        if (request.sortOrder() == null) {
            slot.setSortOrder(promoSlotRepository
                    .findByPlacementOrderBySortOrderAsc(slot.getPlacement()).size());
        }

        PromoSlot saved = promoSlotRepository.save(slot);
        auditService.record(principal.user(), AuditAction.CREATE_PROMO,
                "promo", saved.getId(), null,
                "Added " + saved.getPlacement() + " panel \"" + saved.getTitle() + "\".");
        return toDto(saved);
    }

    @Transactional
    public PromoSlotDto update(Principal principal, UUID id, SavePromoRequest request) {
        accessGuard.requireAdmin(principal);

        PromoSlot slot = find(id);
        String previousTitle = slot.getTitle();
        apply(slot, request);

        auditService.record(principal.user(), AuditAction.UPDATE_PROMO,
                "promo", slot.getId(), null,
                "Edited " + slot.getPlacement() + " panel \"" + previousTitle + "\""
                        + (previousTitle.equals(slot.getTitle()) ? "." : " -> \"" + slot.getTitle() + "\"."));
        return toDto(slot);
    }

    /**
     * Hides or shows a panel without destroying it, which is what an admin
     * almost always means by "take that down" - a seasonal campaign comes back.
     */
    @Transactional
    public PromoSlotDto setActive(Principal principal, UUID id, boolean active) {
        accessGuard.requireAdmin(principal);

        PromoSlot slot = find(id);
        slot.setActive(active);

        auditService.record(principal.user(), AuditAction.UPDATE_PROMO,
                "promo", slot.getId(), null,
                (active ? "Published" : "Hid") + " panel \"" + slot.getTitle() + "\".");
        return toDto(slot);
    }

    @Transactional
    public void delete(Principal principal, UUID id) {
        accessGuard.requireAdmin(principal);

        PromoSlot slot = find(id);
        auditService.record(principal.user(), AuditAction.DELETE_PROMO,
                "promo", slot.getId(), null,
                "Deleted " + slot.getPlacement() + " panel \"" + slot.getTitle() + "\".");
        promoSlotRepository.delete(slot);
    }

    /** Rewrites sort order for one placement from the given id sequence. */
    @Transactional
    public List<PromoSlotDto> reorder(Principal principal, String placementRaw, List<UUID> orderedIds) {
        accessGuard.requireAdmin(principal);

        PromoPlacement placement = parsePlacement(placementRaw);
        List<PromoSlot> slots = promoSlotRepository.findByPlacementOrderBySortOrderAsc(placement);

        if (orderedIds != null) {
            for (int i = 0; i < orderedIds.size(); i++) {
                UUID target = orderedIds.get(i);
                final int position = i;
                // Ids that no longer exist are skipped rather than failing the
                // whole reorder: another admin may have deleted one mid-drag.
                slots.stream()
                        .filter(s -> s.getId().equals(target))
                        .findFirst()
                        .ifPresent(s -> s.setSortOrder(position));
            }
        }

        auditService.record(principal.user(), AuditAction.REORDER_PROMO,
                "promo", null, null, "Reordered the " + placement + " section.");

        return promoSlotRepository.findByPlacementOrderBySortOrderAsc(placement)
                .stream().map(this::toDto).toList();
    }

    // ------------------------------------------------------------- helpers
    private PromoSlot find(UUID id) {
        return promoSlotRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("That panel no longer exists."));
    }

    private void apply(PromoSlot slot, SavePromoRequest request) {
        slot.setPlacement(parsePlacement(request.placement()));
        slot.setTitle(request.title().trim());
        slot.setSubtitle(blankToNull(request.subtitle()));
        slot.setCtaLabel(blankToNull(request.ctaLabel()));
        slot.setCtaLink(normalizeLink(request.ctaLink()));
        slot.setBadge(blankToNull(request.badge()));
        slot.setImageUrl(ImageStorageService.toStoredForm(validateImage(request.imageUrl())));
        applyCollage(slot, request.collageImages());
        slot.setTheme(parseTheme(request.theme()));
        slot.setBgColor(normalizeColor(request.bgColor(), "Background colour"));
        slot.setTextColor(normalizeColor(request.textColor(), "Text colour"));
        slot.setButtonColor(normalizeColor(request.buttonColor(), "Button colour"));
        slot.setButtonTextColor(normalizeColor(request.buttonTextColor(), "Button text colour"));

        if (request.imageOverlay() != null) {
            // Clamped rather than rejected - a slider is the input, and there is
            // an obviously right answer at either end.
            slot.setImageOverlay(Math.max(0, Math.min(100, request.imageOverlay())));
        }
        if (request.wide() != null) {
            slot.setWide(request.wide());
        }
        if (request.active() != null) {
            slot.setActive(request.active());
        }
        if (request.sortOrder() != null) {
            slot.setSortOrder(request.sortOrder());
        }
    }

    /**
     * Only in-app paths are accepted.
     *
     * <p>This is the busiest public surface in the product and its links are
     * editable from an admin form. Allowing arbitrary external URLs would turn
     * one compromised or careless admin account into a phishing banner on the
     * home page, so the value has to start with a single "/" - no scheme, and
     * no protocol-relative "//host" either.
     */
    private String normalizeLink(String raw) {
        String link = blankToNull(raw);
        if (link == null) {
            return null;
        }
        if (!link.startsWith("/") || link.startsWith("//")) {
            throw ApiException.badRequest("INVALID_LINK",
                    "Links must point inside the app and start with \"/\", for example /browse?type=Food.");
        }
        return link;
    }

    private String validateImage(String raw) {
        String image = blankToNull(raw);
        if (image == null) {
            return null;
        }
        if (image.length() > MAX_IMAGE_CHARS) {
            throw ApiException.badRequest("IMAGE_TOO_LARGE",
                    "That background image is too large. Use a smaller or more compressed one.");
        }
        // An upload ("/api/uploads/..."), a pasted external link, or - kept for
        // rows a client posts directly rather than through the upload flow - a
        // raw data URL.
        if (!image.startsWith("data:image/") && !image.startsWith("http://")
                && !image.startsWith("https://") && !image.startsWith("/")) {
            throw ApiException.badRequest("INVALID_IMAGE",
                    "Upload an image or paste a direct image URL.");
        }
        return image;
    }

    /**
     * Replaces the banner's collage.
     *
     * <p>Mutated in place rather than reassigned: the field is a Hibernate
     * element collection, and handing it a new List detaches the one the
     * session is tracking - the classic orphan-removal failure where the old
     * rows are never deleted.
     *
     * <p>Every URL goes through the same check a background image does, for
     * the same reason: these are admin-entered values rendered into an img on
     * a public page.
     */
    private void applyCollage(PromoSlot slot, List<String> raw) {
        List<String> cleaned = new ArrayList<>();
        if (raw != null) {
            for (String candidate : raw) {
                String image = ImageStorageService.toStoredForm(validateImage(candidate));
                // Blanks are dropped rather than rejected: the editor's rows
                // are a fixed-length array client-side, so an empty one means
                // "no picture here", not a mistake worth refusing a save over.
                if (image != null) {
                    cleaned.add(image);
                }
            }
        }
        if (cleaned.size() > MAX_COLLAGE_IMAGES) {
            throw ApiException.badRequest("TOO_MANY_IMAGES",
                    "A banner can hold " + MAX_COLLAGE_IMAGES + " pictures at most.");
        }
        slot.getCollageImages().clear();
        slot.getCollageImages().addAll(cleaned);
    }

    private PromoPlacement parsePlacement(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest("Choose where this panel appears.");
        }
        try {
            return PromoPlacement.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(
                    "Panels can go in the carousel, the special offers grid, or the browse banners.");
        }
    }

    private PromoTheme parseTheme(String raw) {
        if (raw == null || raw.isBlank()) {
            return PromoTheme.BLUE;
        }
        try {
            return PromoTheme.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Unknown colour theme: " + raw);
        }
    }

    /**
     * A custom colour, or null to fall back to the theme.
     *
     * <p>Bean validation has already checked the shape, so this is not the
     * only guard - but it is the one that runs for every caller of the
     * service, including anything that bypasses the controller. The value is
     * interpolated into a style attribute on the home page; "validated at the
     * edge" is not a property worth betting that page on.
     *
     * <p>Lower-cased on the way in so the database CHECK (which is
     * case-sensitive) and any later equality comparison agree, and so two
     * admins typing the same colour in different cases produce one value.
     */
    private String normalizeColor(String raw, String label) {
        String value = blankToNull(raw);
        if (value == null) {
            return null;
        }
        String hex = value.toLowerCase(java.util.Locale.ROOT);
        if (!hex.matches("^#[0-9a-f]{6}$")) {
            throw ApiException.badRequest("INVALID_COLOR",
                    label + " must be a hex value like #2563eb.");
        }
        return hex;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private PromoSlotDto toDto(PromoSlot slot) {
        return new PromoSlotDto(
                slot.getId(),
                slot.getPlacement().name(),
                slot.getTitle(),
                slot.getSubtitle(),
                slot.getCtaLabel(),
                slot.getCtaLink(),
                slot.getBadge(),
                slot.getImageUrl(),
                List.copyOf(slot.getCollageImages()),
                slot.getImageOverlay(),
                slot.getTheme().name(),
                slot.getBgColor(),
                slot.getTextColor(),
                slot.getButtonColor(),
                slot.getButtonTextColor(),
                slot.isWide(),
                slot.isActive(),
                slot.getSortOrder(),
                slot.getUpdatedAt());
    }
}
