package com.campusmarket.repository;

import com.campusmarket.domain.Order;
import com.campusmarket.domain.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    /**
     * The seller's inbox. Excludes HELD in the query rather than in the caller,
     * so an unverified seller cannot learn an order exists before an admin has
     * released it - the filter cannot be forgotten at a call site.
     */
    @Query("""
           SELECT DISTINCT o FROM Order o
           LEFT JOIN FETCH o.items
           WHERE o.seller.id = :sellerId
             AND o.status <> com.campusmarket.domain.OrderStatus.HELD
           ORDER BY o.createdAt DESC
           """)
    List<Order> findForSellerVisible(@Param("sellerId") UUID sellerId);

    /** The admin review queue: withheld orders, longest-waiting first. */
    @Query("""
           SELECT DISTINCT o FROM Order o
           LEFT JOIN FETCH o.items
           WHERE o.status = com.campusmarket.domain.OrderStatus.HELD
           ORDER BY o.createdAt ASC
           """)
    List<Order> findHeld();

    long countByStatus(OrderStatus status);

    /** The buyer's own placed orders. */
    @Query("""
           SELECT DISTINCT o FROM Order o
           LEFT JOIN FETCH o.items
           WHERE o.buyer.id = :buyerId
           ORDER BY o.createdAt DESC
           """)
    List<Order> findForBuyer(@Param("buyerId") UUID buyerId);

    @Query("""
           SELECT DISTINCT o FROM Order o
           LEFT JOIN FETCH o.items
           WHERE o.id = :id
           """)
    Optional<Order> findByIdWithItems(@Param("id") UUID id);

    /** Drives the "N orders need your attention" badge on the seller nav. */
    long countBySellerIdAndStatusIn(UUID sellerId, Collection<OrderStatus> statuses);

    boolean existsByReference(String reference);
}
