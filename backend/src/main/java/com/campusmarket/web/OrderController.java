package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.OrderService;
import com.campusmarket.web.dto.CommerceDtos.CheckoutOrdersDto;
import com.campusmarket.web.dto.CommerceDtos.OrderDto;
import com.campusmarket.web.request.CommerceRequests.CheckoutRequest;
import com.campusmarket.web.request.CommerceRequests.OrderActionRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Buyer-placed orders.
 *
 * <p>Reads are split by side rather than filtered client-side: {@code /incoming}
 * is the seller's inbox and {@code /placed} is the buyer's history, so neither
 * can accidentally show the other's rows.
 */
@RestController
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/api/orders/checkout")
    public CheckoutOrdersDto checkout(@AuthPrincipal Principal principal,
                                      @RequestBody(required = false) CheckoutRequest request) {
        return orderService.checkout(principal, request);
    }

    /** Orders placed WITH me - what a seller acts on. */
    @GetMapping("/api/orders/incoming")
    public Map<String, Object> incoming(@AuthPrincipal Principal principal) {
        List<OrderDto> orders = orderService.incoming(principal);
        return Map.of("orders", orders);
    }

    /** Orders I placed. */
    @GetMapping("/api/orders/placed")
    public Map<String, Object> placed(@AuthPrincipal Principal principal) {
        return Map.of("orders", orderService.placed(principal));
    }

    /**
     * A single order, for its detail page and for the deep link a notification
     * carries. Declared after the two literal paths so "incoming" and "placed"
     * are never swallowed by the {orderId} pattern.
     */
    @GetMapping("/api/orders/{orderId}")
    public Map<String, Object> byId(@AuthPrincipal Principal principal, @PathVariable UUID orderId) {
        return Map.of("order", orderService.byId(principal, orderId));
    }

    @PostMapping("/api/orders/{orderId}/accept")
    public OrderDto accept(@AuthPrincipal Principal principal, @PathVariable UUID orderId) {
        return orderService.accept(principal, orderId);
    }

    @PostMapping("/api/orders/{orderId}/decline")
    public OrderDto decline(@AuthPrincipal Principal principal,
                            @PathVariable UUID orderId,
                            @RequestBody(required = false) OrderActionRequest request) {
        return orderService.decline(principal, orderId, request == null ? null : request.note());
    }

    @PostMapping("/api/orders/{orderId}/complete")
    public OrderDto complete(@AuthPrincipal Principal principal, @PathVariable UUID orderId) {
        return orderService.complete(principal, orderId);
    }

    @PostMapping("/api/orders/{orderId}/cancel")
    public OrderDto cancel(@AuthPrincipal Principal principal, @PathVariable UUID orderId) {
        return orderService.cancel(principal, orderId);
    }
}
