package com.campusmarket.repository;

import com.campusmarket.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    Optional<Category> findBySlug(String slug);

    boolean existsBySlug(String slug);

    List<Category> findAllByOrderBySortOrderAscNameAsc();

    /** Sub-categories must be re-parented before a parent can be deleted. */
    boolean existsByParentId(UUID parentId);
}
