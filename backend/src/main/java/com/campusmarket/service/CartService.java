package com.campusmarket.service;

import com.campusmarket.domain.*;
import com.campusmarket.repository.CartItemRepository;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.CommerceDtos.*;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Workflow 12: cart management. Checkout itself lives in {@link OrderService}. */
@Service
@RequiredArgsConstructor
public class CartService {

    private final CartItemRepository cartItemRepository;
    private final ListingRepository listingRepository;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    @Transactional(readOnly = true)
    public CartDto getCart(Principal principal) {
        accessGuard.requireCustomer(principal);
        return buildCart(cartItemRepository.findByUserIdOrderByAddedAtDesc(principal.id()), principal);
    }

    @Transactional
    public CartDto add(Principal principal, UUID listingId, Integer quantity) {
        accessGuard.requireCustomer(principal);

        Listing listing = listingRepository.findByIdAndDeletedFalse(listingId)
                .orElseThrow(() -> ApiException.notFound("This listing is no longer available."));

        // Services are arranged through a booking request, not a cart (workflow 14).
        if (listing.getType() == ListingType.SERVICE) {
            throw ApiException.badRequest("SERVICE_NOT_CARTABLE",
                    "Services are booked directly. Use Request Booking instead.");
        }
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw ApiException.badRequest("LISTING_UNAVAILABLE",
                    "This item is no longer available.");
        }
        if (listing.getSeller().getId().equals(principal.id())) {
            throw ApiException.badRequest("OWN_LISTING", "You cannot add your own listing to the cart.");
        }

        int qty = quantity == null || quantity < 1 ? 1 : quantity;
        capToStock(listing, qty);

        cartItemRepository.findByUserIdAndListingId(principal.id(), listingId)
                .ifPresentOrElse(
                        existing -> {
                            int merged = existing.getQuantity() + qty;
                            capToStock(listing, merged);
                            existing.setQuantity(merged);
                        },
                        () -> {
                            CartItem item = new CartItem();
                            item.setUser(principal.user());
                            item.setListing(listing);
                            item.setQuantity(qty);
                            cartItemRepository.save(item);
                        });

        return getCartInternal(principal);
    }

    @Transactional
    public CartDto updateQuantity(Principal principal, UUID cartItemId, int quantity) {
        accessGuard.requireCustomer(principal);

        // Scoped by user id, so one customer cannot touch another's cart row.
        CartItem item = cartItemRepository.findByIdAndUserId(cartItemId, principal.id())
                .orElseThrow(() -> ApiException.notFound("Cart item not found."));

        if (quantity < 1) {
            cartItemRepository.delete(item);
        } else {
            capToStock(item.getListing(), quantity);
            item.setQuantity(quantity);
        }
        return getCartInternal(principal);
    }

    @Transactional
    public CartDto remove(Principal principal, UUID cartItemId) {
        accessGuard.requireCustomer(principal);
        CartItem item = cartItemRepository.findByIdAndUserId(cartItemId, principal.id())
                .orElseThrow(() -> ApiException.notFound("Cart item not found."));
        cartItemRepository.delete(item);
        return getCartInternal(principal);
    }

    // Checkout moved to OrderService. It used to only open a chat thread per
    // seller, which left the seller with no record to act on - now it writes an
    // Order they can accept, decline or complete, and still posts the thread.

    // ---------------------------------------------------------------- helpers
    private CartDto getCartInternal(Principal principal) {
        cartItemRepository.flush();
        return buildCart(cartItemRepository.findByUserIdOrderByAddedAtDesc(principal.id()), principal);
    }

    private CartDto buildCart(List<CartItem> items, Principal principal) {
        List<CartItemDto> dtos = items.stream().map(item -> {
            Listing listing = item.getListing();
            boolean available = mapper.isPurchasable(listing);
            String reason = available ? null
                    : listing.isDeleted() ? "This listing was removed by the seller."
                    : listing.getStatus() == ListingStatus.SOLD ? "This item has been sold."
                    : "This item is currently reserved.";

            return new CartItemDto(
                    item.getId(),
                    mapper.listingRef(listing),
                    mapper.user(listing.getSeller(), principal),
                    item.getQuantity(),
                    listing.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())),
                    available,
                    reason,
                    item.getAddedAt());
        }).toList();

        BigDecimal subtotal = dtos.stream()
                .filter(CartItemDto::available)
                .map(CartItemDto::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new CartDto(dtos, subtotal, dtos.size(),
                dtos.stream().anyMatch(dto -> !dto.available()));
    }

    /** Food listings carry a serving count; never let the cart exceed it. */
    private void capToStock(Listing listing, int requested) {
        Integer stock = Listings.availableStock(listing);
        if (stock != null && requested > stock) {
            throw ApiException.badRequest("INSUFFICIENT_STOCK",
                    stock == 1
                            ? "There's only one of these."
                            : "Only " + stock + " left.");
        }
    }
}
