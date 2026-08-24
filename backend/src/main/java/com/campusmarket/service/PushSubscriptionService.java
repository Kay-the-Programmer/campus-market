package com.campusmarket.service;

import com.campusmarket.domain.NotificationPreference;
import com.campusmarket.domain.PushDevice;
import com.campusmarket.domain.PushPlatform;
import com.campusmarket.repository.NotificationPreferenceRepository;
import com.campusmarket.repository.PushDeviceRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ModerationDtos.NotificationPreferencesDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * The subscription side of push: which devices belong to whom, and what each
 * user has agreed to be interrupted for.
 */
@Service
@RequiredArgsConstructor
public class PushSubscriptionService {

    private final PushDeviceRepository pushDeviceRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final PushNotificationService pushNotificationService;
    private final AccessGuard accessGuard;

    /**
     * Registers - or re-registers - the calling device.
     *
     * <p>Clients call this on every login and whenever FCM hands them a rotated
     * token, so it is idempotent by design. A token already on file is moved to
     * the current user rather than duplicated: the token identifies a browser
     * profile, and on a shared campus laptop the last person to log in is the
     * one who should get the notifications - the previous account must stop
     * receiving them the moment they log out.
     */
    @Transactional
    public void registerDevice(Principal principal, String token, String platform, String userAgent) {
        accessGuard.requireAuthenticated(principal);
        String trimmed = token == null ? "" : token.trim();
        if (trimmed.isEmpty()) {
            throw ApiException.badRequest("A device token is required.");
        }

        PushDevice device = pushDeviceRepository.findByToken(trimmed).orElseGet(PushDevice::new);
        device.setToken(trimmed);
        device.setUser(principal.user());
        device.setPlatform(parsePlatform(platform));
        device.setUserAgent(truncate(userAgent));
        device.setLastSeenAt(Instant.now());
        pushDeviceRepository.save(device);

        // First registration is also the first time we know this user wants push,
        // so give them a preferences row to edit instead of an implicit default.
        preferenceRepository.findById(principal.id())
                .orElseGet(() -> preferenceRepository.save(newPreferences(principal)));
    }

    /**
     * Drops a registration. Scoped to the caller so one account cannot silence
     * another's device by guessing a token, and quietly does nothing when the
     * token is already gone - logout should not fail over a missing row.
     */
    @Transactional
    public void unregisterDevice(Principal principal, String token) {
        accessGuard.requireAuthenticated(principal);
        if (token == null || token.isBlank()) {
            return;
        }
        pushDeviceRepository.deleteByUserIdAndToken(principal.id(), token.trim());
    }

    @Transactional(readOnly = true)
    public NotificationPreferencesDto getPreferences(Principal principal) {
        accessGuard.requireAuthenticated(principal);
        NotificationPreference preferences = preferenceRepository.findById(principal.id())
                .orElseGet(() -> newPreferences(principal));
        return toDto(preferences, pushDeviceRepository.findByUserId(principal.id()).size());
    }

    /**
     * Partial update: every field is nullable and only the ones present change,
     * so a single toggle in the UI does not have to send - and risk clobbering -
     * the rest of someone's settings.
     */
    @Transactional
    public NotificationPreferencesDto updatePreferences(Principal principal,
                                                        Boolean pushEnabled,
                                                        Boolean messages,
                                                        Boolean orders,
                                                        Boolean reviews,
                                                        Boolean priceDrops,
                                                        Boolean systemUpdates) {
        accessGuard.requireAuthenticated(principal);
        NotificationPreference preferences = preferenceRepository.findById(principal.id())
                .orElseGet(() -> newPreferences(principal));

        Optional.ofNullable(pushEnabled).ifPresent(preferences::setPushEnabled);
        Optional.ofNullable(messages).ifPresent(preferences::setMessages);
        Optional.ofNullable(orders).ifPresent(preferences::setOrders);
        Optional.ofNullable(reviews).ifPresent(preferences::setReviews);
        Optional.ofNullable(priceDrops).ifPresent(preferences::setPriceDrops);
        Optional.ofNullable(systemUpdates).ifPresent(preferences::setSystemUpdates);
        preferences.setUpdatedAt(Instant.now());

        NotificationPreference saved = preferenceRepository.save(preferences);
        return toDto(saved, pushDeviceRepository.findByUserId(principal.id()).size());
    }

    private NotificationPreference newPreferences(Principal principal) {
        NotificationPreference preferences = new NotificationPreference();
        preferences.setUserId(principal.id());
        return preferences;
    }

    private NotificationPreferencesDto toDto(NotificationPreference p, int deviceCount) {
        return new NotificationPreferencesDto(
                p.isPushEnabled(),
                p.isMessages(),
                p.isOrders(),
                p.isReviews(),
                p.isPriceDrops(),
                p.isSystemUpdates(),
                deviceCount,
                // Without server credentials there is nothing behind the toggles,
                // so the UI hides the opt-in rather than offering a dead switch.
                pushNotificationService.isConfigured());
    }

    private PushPlatform parsePlatform(String platform) {
        if (platform == null || platform.isBlank()) {
            return PushPlatform.WEB;
        }
        try {
            return PushPlatform.valueOf(platform.trim().toUpperCase());
        } catch (IllegalArgumentException unknown) {
            return PushPlatform.WEB;
        }
    }

    /** User-agent strings are long and only used as a label; the column is not. */
    private String truncate(String userAgent) {
        if (userAgent == null) {
            return null;
        }
        return userAgent.length() <= 255 ? userAgent : userAgent.substring(0, 255);
    }
}
