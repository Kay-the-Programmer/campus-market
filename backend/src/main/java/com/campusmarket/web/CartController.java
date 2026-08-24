package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.CartService;
import com.campusmarket.service.SavedListingService;
import com.campusmarket.web.dto.CommerceDtos.CartDto;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.request.CommerceRequests.AddToCartRequest;
import com.campusmarket.web.request.CommerceRequests.QuantityRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;
    private final SavedListingService savedListingService;

    // ------------------------------------------------------------------ cart
    @GetMapping("/api/cart")
    public CartDto getCart(@AuthPrincipal Principal principal) {
        return cartService.getCart(principal);
    }

    @PostMapping("/api/cart")
    public CartDto add(@AuthPrincipal Principal principal,
                       @Valid @RequestBody AddToCartRequest request) {
        return cartService.add(principal, request.listingId(), request.quantity());
    }

    @PutMapping("/api/cart/{itemId}")
    public CartDto updateQuantity(@AuthPrincipal Principal principal,
                                  @PathVariable UUID itemId,
                                  @Valid @RequestBody QuantityRequest request) {
        return cartService.updateQuantity(principal, itemId, request.quantity());
    }

    @DeleteMapping("/api/cart/{itemId}")
    public CartDto remove(@AuthPrincipal Principal principal, @PathVariable UUID itemId) {
        return cartService.remove(principal, itemId);
    }

    // Checkout lives on OrderController now: it writes real Order rows the
    // seller can accept or decline, rather than only opening a chat thread.

    // ----------------------------------------------------------------- saved
    @GetMapping("/api/saved")
    public Map<String, List<ListingDto>> saved(@AuthPrincipal Principal principal) {
        return Map.of("saved", savedListingService.list(principal));
    }

    @PostMapping("/api/saved/{listingId}")
    public Map<String, Object> toggleSaved(@AuthPrincipal Principal principal,
                                           @PathVariable UUID listingId) {
        return savedListingService.toggle(principal, listingId);
    }
}
