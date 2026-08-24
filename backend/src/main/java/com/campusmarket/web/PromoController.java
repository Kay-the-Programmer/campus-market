package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.PromoService;
import com.campusmarket.web.dto.PromoDtos.PromoSlotDto;
import com.campusmarket.web.request.PromoRequests.ReorderPromosRequest;
import com.campusmarket.web.request.PromoRequests.SavePromoRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The editable home page.
 *
 * <p>{@code GET /api/promos} is public - the feed renders it before anyone
 * signs in. Everything under {@code /api/admin/promos} re-checks the admin role
 * in {@link PromoService}; the URL prefix is not the gate.
 */
@RestController
@RequiredArgsConstructor
public class PromoController {

    private final PromoService promoService;

    /** Public: active panels only. */
    @GetMapping("/api/promos")
    public Map<String, List<PromoSlotDto>> list() {
        return Map.of("promos", promoService.listActive());
    }

    /** Admin: includes hidden panels, which the editor needs to show. */
    @GetMapping("/api/admin/promos")
    public Map<String, List<PromoSlotDto>> listAll(@AuthPrincipal Principal principal) {
        return Map.of("promos", promoService.listAll(principal));
    }

    @PostMapping("/api/admin/promos")
    public PromoSlotDto create(@AuthPrincipal Principal principal,
                               @Valid @RequestBody SavePromoRequest request) {
        return promoService.create(principal, request);
    }

    @PutMapping("/api/admin/promos/{id}")
    public PromoSlotDto update(@AuthPrincipal Principal principal,
                               @PathVariable UUID id,
                               @Valid @RequestBody SavePromoRequest request) {
        return promoService.update(principal, id, request);
    }

    /** Show/hide without deleting - the usual meaning of "take that down". */
    @PostMapping("/api/admin/promos/{id}/active")
    public PromoSlotDto setActive(@AuthPrincipal Principal principal,
                                  @PathVariable UUID id,
                                  @RequestParam boolean active) {
        return promoService.setActive(principal, id, active);
    }

    @PostMapping("/api/admin/promos/reorder")
    public Map<String, List<PromoSlotDto>> reorder(@AuthPrincipal Principal principal,
                                                   @Valid @RequestBody ReorderPromosRequest request) {
        return Map.of("promos",
                promoService.reorder(principal, request.placement(), request.orderedIds()));
    }

    @DeleteMapping("/api/admin/promos/{id}")
    public Map<String, Object> delete(@AuthPrincipal Principal principal, @PathVariable UUID id) {
        promoService.delete(principal, id);
        return Map.of("success", true);
    }
}
