package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.CategoryService;
import com.campusmarket.web.dto.ListingDtos.CategoryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Workflow 22. Mapped at {@code /api} rather than one fixed prefix because the
 * catalogue is read publicly at {@code /api/categories} but only ever written
 * through {@code /api/admin/categories}.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CategoryController {

    private static final CategoryRequest EMPTY = new CategoryRequest(null, null, null, null);

    private final CategoryService categoryService;

    public record CategoryRequest(String name, String icon, UUID parentId, Integer sortOrder) {}

    /** Public: guests filter the browse page before they have an account. */
    @GetMapping("/categories")
    public List<CategoryDto> list() {
        return categoryService.list();
    }

    @PostMapping("/admin/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryDto create(@AuthPrincipal Principal principal,
                              @RequestBody(required = false) CategoryRequest request) {
        CategoryRequest body = request == null ? EMPTY : request;
        return categoryService.create(principal, body.name(), body.icon(), body.parentId(), body.sortOrder());
    }

    @PutMapping("/admin/categories/{id}")
    public CategoryDto update(@AuthPrincipal Principal principal,
                              @PathVariable UUID id,
                              @RequestBody(required = false) CategoryRequest request) {
        CategoryRequest body = request == null ? EMPTY : request;
        return categoryService.update(principal, id, body.name(), body.icon(), body.parentId(), body.sortOrder());
    }

    /** {@code ?reassignTo=} moves the listings across instead of blocking the delete. */
    @DeleteMapping("/admin/categories/{id}")
    public ResponseEntity<Void> delete(@AuthPrincipal Principal principal,
                                       @PathVariable UUID id,
                                       @RequestParam(required = false) UUID reassignTo) {
        categoryService.delete(principal, id, reassignTo);
        return ResponseEntity.noContent().build();
    }
}
