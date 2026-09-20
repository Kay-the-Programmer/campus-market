package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.NotificationService;
import com.campusmarket.service.PushSubscriptionService;
import com.campusmarket.web.dto.ModerationDtos.NotificationDto;
import com.campusmarket.web.dto.ModerationDtos.NotificationPreferencesDto;
import com.campusmarket.web.request.PushRequests.NotificationPreferencesRequest;
import com.campusmarket.web.request.PushRequests.RegisterDeviceRequest;
import com.campusmarket.web.request.PushRequests.UnregisterDeviceRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Workflow 18. Notifications are the one authenticated surface admins keep. */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final PushSubscriptionService pushSubscriptionService;

    @GetMapping
    public Map<String, Object> list(@AuthPrincipal Principal principal) {
        List<NotificationDto> notifications = notificationService.list(principal);
        return Map.of(
                "notifications", notifications,
                "unreadCount", notifications.stream().filter(n -> !n.read()).count());
    }

    @PostMapping("/{id}/read")
    public Map<String, Object> markRead(@AuthPrincipal Principal principal, @PathVariable UUID id) {
        notificationService.markRead(principal, id);
        return Map.of("success", true);
    }

    @PostMapping("/read-all")
    public Map<String, Object> markAllRead(@AuthPrincipal Principal principal) {
        return Map.of("success", true, "updated", notificationService.markAllRead(principal));
    }

    // ------------------------------------------------------------------ push

    /**
     * Called on login and whenever FCM rotates the token, so it is a POST that
     * expects to be repeated rather than a create-once resource.
     */
    @PostMapping("/devices")
    public Map<String, Object> registerDevice(@AuthPrincipal Principal principal,
                                              @RequestBody RegisterDeviceRequest request) {
        pushSubscriptionService.registerDevice(
                principal, request.token(), request.platform(), request.label());
        return Map.of("success", true);
    }

    /**
     * POST rather than DELETE: the token is too long for a path segment, and
     * DELETE-with-a-body is not reliably carried by proxies. This is also the
     * last call before logout, so it is the one that must not fail.
     */
    @PostMapping("/devices/unregister")
    public Map<String, Object> unregisterDevice(@AuthPrincipal Principal principal,
                                                @RequestBody UnregisterDeviceRequest request) {
        pushSubscriptionService.unregisterDevice(principal, request.token());
        return Map.of("success", true);
    }

    @GetMapping("/preferences")
    public Map<String, Object> preferences(@AuthPrincipal Principal principal) {
        return Map.of("preferences", pushSubscriptionService.getPreferences(principal));
    }

    @PutMapping("/preferences")
    public Map<String, Object> updatePreferences(@AuthPrincipal Principal principal,
                                                 @RequestBody NotificationPreferencesRequest request) {
        NotificationPreferencesDto updated = pushSubscriptionService.updatePreferences(
                principal,
                request.pushEnabled(),
                request.messages(),
                request.orders(),
                request.reviews(),
                request.priceDrops(),
                request.systemUpdates(),
                request.emailEnabled(),
                request.marketingEmails());
        return Map.of("success", true, "preferences", updated);
    }
}
