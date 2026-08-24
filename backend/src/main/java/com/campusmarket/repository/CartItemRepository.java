package com.campusmarket.repository;

import com.campusmarket.domain.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CartItemRepository extends JpaRepository<CartItem, UUID> {

    List<CartItem> findByUserIdOrderByAddedAtDesc(UUID userId);

    Optional<CartItem> findByUserIdAndListingId(UUID userId, UUID listingId);

    Optional<CartItem> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);

    void deleteByUserIdAndListingId(UUID userId, UUID listingId);
}
