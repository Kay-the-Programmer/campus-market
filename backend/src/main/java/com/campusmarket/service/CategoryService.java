package com.campusmarket.service;

import com.campusmarket.domain.AuditAction;
import com.campusmarket.domain.Category;
import com.campusmarket.domain.Listing;
import com.campusmarket.repository.CategoryRepository;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ListingDtos.CategoryDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Workflow 22 - the category taxonomy.
 *
 * <p>Reading the tree is public because browse and search need it before anyone
 * signs in; every write is admin-only and audited.
 */
@Service
@RequiredArgsConstructor
public class CategoryService {

    /** Slug column is VARCHAR(80). */
    private static final int MAX_SLUG_LENGTH = 80;

    /** Depth ceiling while walking ancestors, so a pre-existing loop cannot hang a request. */
    private static final int MAX_TREE_DEPTH = 50;

    private final CategoryRepository categoryRepository;
    private final ListingRepository listingRepository;
    private final AccessGuard accessGuard;
    private final AuditService auditService;
    private final DtoMapper mapper;

    /** Public - no principal, no guard. Ordered by sortOrder then name. */
    @Transactional(readOnly = true)
    public List<CategoryDto> list() {
        return categoryRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(category -> mapper.category(category, publicListingCount(category.getId())))
                .toList();
    }

    /**
     * The number shown beside a category name, counted the way the browse and
     * search feeds count. See {@link ListingSpecifications#publicInCategory}.
     */
    private long publicListingCount(UUID categoryId) {
        return listingRepository.count(ListingSpecifications.publicInCategory(categoryId));
    }

    @Transactional
    public CategoryDto create(Principal principal, String name, String icon, UUID parentId, Integer sortOrder) {
        accessGuard.requireAdmin(principal);

        String cleanName = trimToNull(name);
        if (cleanName == null) {
            throw ApiException.badRequest("Give the category a name.");
        }

        String slug = slugify(cleanName);
        if (slug.isEmpty()) {
            throw ApiException.badRequest("Category names need at least one letter or number.");
        }
        if (categoryRepository.existsBySlug(slug)) {
            throw ApiException.conflict(
                    "CATEGORY_SLUG_TAKEN",
                    "A category with the web address \"" + slug + "\" already exists. Pick a different name.");
        }

        Category category = new Category();
        category.setName(cleanName);
        category.setSlug(slug);
        category.setIcon(trimToNull(icon));
        category.setParent(parentId == null ? null : findCategory(parentId, "That parent category does not exist."));
        category.setSortOrder(sortOrder == null ? 0 : sortOrder);

        Category saved = categoryRepository.save(category);

        auditService.record(principal.user(), AuditAction.CREATE_CATEGORY, "category", saved.getId(), null,
                "Created category \"" + cleanName + "\" (" + slug + ").");

        return mapper.category(saved, 0);
    }

    @Transactional
    public CategoryDto update(Principal principal, UUID id, String name, String icon, UUID parentId, Integer sortOrder) {
        accessGuard.requireAdmin(principal);

        Category category = findCategory(id, "That category no longer exists.");

        String cleanName = trimToNull(name);
        if (cleanName == null) {
            throw ApiException.badRequest("Give the category a name.");
        }

        // PUT replaces the record, so an absent parentId means "top level".
        if (parentId == null) {
            category.setParent(null);
        } else {
            if (parentId.equals(id)) {
                throw ApiException.badRequest("A category cannot be its own parent.");
            }
            Category parent = findCategory(parentId, "That parent category does not exist.");
            requireNoCycle(category, parent);
            category.setParent(parent);
        }

        String previousName = category.getName();
        category.setName(cleanName);
        category.setIcon(trimToNull(icon));
        if (sortOrder != null) {
            category.setSortOrder(sortOrder);
        }

        // The slug is deliberately left alone: it is the public URL key, and renaming a
        // category should not break every link and bookmark pointing at it.
        auditService.record(principal.user(), AuditAction.UPDATE_CATEGORY, "category", category.getId(), null,
                "Updated category \"" + previousName + "\" -> \"" + cleanName + "\" (slug " + category.getSlug() + " kept).");

        return mapper.category(category, publicListingCount(category.getId()));
    }

    /**
     * Deleting a category never deletes listings. Live listings block the delete
     * unless {@code reassignTo} is supplied, in which case they are moved first.
     */
    @Transactional
    public void delete(Principal principal, UUID id, UUID reassignTo) {
        accessGuard.requireAdmin(principal);

        Category category = findCategory(id, "That category no longer exists.");
        String name = category.getName();

        // Checked before any listing is touched: re-parenting the children is the only
        // fix, so reassignTo cannot help and the admin should hear that straight away.
        if (categoryRepository.existsByParentId(id)) {
            throw ApiException.conflict(
                    "CATEGORY_HAS_CHILDREN",
                    "\"" + name + "\" still has sub-categories. Move or delete them first.");
        }

        if (reassignTo != null) {
            if (reassignTo.equals(id)) {
                throw ApiException.badRequest("Choose a different category to move the listings into.");
            }
            Category target = findCategory(reassignTo, "That replacement category does not exist.");

            // Soft-deleted listings are moved too, not just the live ones: their history
            // keeps a real category instead of being blanked out by the cleanup below.
            Specification<Listing> inCategory = (root, query, cb) -> cb.equal(root.get("category"), category);
            List<Listing> moving = listingRepository.findAll(inCategory);
            moving.forEach(listing -> listing.setCategory(target));

            long live = moving.stream().filter(listing -> !listing.isDeleted()).count();
            auditService.record(principal.user(), AuditAction.REASSIGN_CATEGORY, "category", id, null,
                    "Moved " + moving.size() + " listing(s) (" + live + " live) from \"" + name
                            + "\" to \"" + target.getName() + "\".");
        } else {
            /*
             * Every undeleted row, deliberately - not the public count used for
             * the chips. This asks "would deleting this orphan anything?", and a
             * DRAFT or SOLD listing still references its category even though no
             * shopper can reach it. Narrowing this to publicly visible rows
             * would let the category be deleted out from under them.
             */
            long inUse = listingRepository.countByCategoryIdAndDeletedFalse(id);
            if (inUse > 0) {
                throw ApiException.conflict(
                        "CATEGORY_IN_USE",
                        inUse + " listings still use this category. Reassign them first.");
            }
        }

        // Recorded before the bulk update below, which flushes and then detaches
        // everything currently loaded.
        auditService.record(principal.user(), AuditAction.DELETE_CATEGORY, "category", id, null,
                "Deleted category \"" + name + "\" (" + category.getSlug() + ").");

        // Soft-deleted listings can still point here and the FK is ON DELETE RESTRICT,
        // so their reference is cleared rather than their history destroyed. Rows just
        // reassigned above already carry the new category and are untouched by this.
        listingRepository.clearCategory(id);
        categoryRepository.deleteById(id);
    }

    private Category findCategory(UUID id, String missingMessage) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound(missingMessage));
    }

    /** Rejects moving a category underneath one of its own descendants. */
    private void requireNoCycle(Category category, Category candidateParent) {
        Category cursor = candidateParent;
        for (int depth = 0; cursor != null && depth < MAX_TREE_DEPTH; depth++) {
            if (cursor.getId().equals(category.getId())) {
                throw ApiException.badRequest(
                        "That would place \"" + category.getName() + "\" inside one of its own sub-categories.");
            }
            cursor = cursor.getParent();
        }
    }

    /** "Textbooks & Notes" -> "textbooks-notes". Accents are folded, not dropped. */
    private static String slugify(String name) {
        String withoutAccents = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        String slug = withoutAccents.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");

        if (slug.length() > MAX_SLUG_LENGTH) {
            slug = slug.substring(0, MAX_SLUG_LENGTH).replaceAll("-+$", "");
        }
        return slug;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
