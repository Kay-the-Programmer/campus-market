package com.campusmarket.service;

import com.campusmarket.config.AsyncConfig;
import com.campusmarket.domain.NotificationPreference;
import com.campusmarket.domain.NotificationType;
import com.campusmarket.domain.PushDevice;
import com.campusmarket.domain.PushPlatform;
import com.campusmarket.repository.NotificationPreferenceRepository;
import com.campusmarket.repository.PushDeviceRepository;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.SendResponse;
import com.google.firebase.messaging.WebpushConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Delivers a notification to a user's registered devices through FCM.
 *
 * <p>This is the interruption half of {@link NotificationService}: the row in
 * {@code notifications} is the record, this is the tap on the shoulder. It runs
 * after the originating transaction commits and on its own executor, so a
 * checkout or a chat message never waits on - or fails because of - Google.
 *
 * <p>Web devices get <em>data-only</em> messages: the service worker decides
 * what to render and what a click does. That keeps notification copy and the
 * deep-link behaviour in one place on the client instead of split between here
 * and there, and it sidesteps FCM's requirement that an auto-displayed
 * notification's click-through URL be HTTPS - which localhost is not.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PushNotificationService {

    /** Long enough to survive a lecture with the laptop shut, short enough to stay relevant. */
    private static final String TTL_SECONDS = "86400";

    private final ObjectProvider<FirebaseMessaging> messagingProvider;
    private final PushDeviceRepository pushDeviceRepository;
    private final NotificationPreferenceRepository preferenceRepository;

    /** Whether the server could actually send a push if asked. Drives the UI's opt-in prompt. */
    public boolean isConfigured() {
        return messagingProvider.getIfAvailable() != null;
    }

    /**
     * Fire-and-forget delivery. Every failure mode here is logged and swallowed:
     * a push that does not arrive must never roll back or fail the action that
     * produced it, and the user still has the in-app notification either way.
     */
    @Async(AsyncConfig.PUSH_EXECUTOR)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void send(UUID userId, NotificationType type, String title, String body,
                     String link, UUID notificationId) {
        FirebaseMessaging messaging = messagingProvider.getIfAvailable();
        if (messaging == null || userId == null) {
            return;
        }

        NotificationPreference preferences = preferenceRepository.findById(userId)
                .orElseGet(NotificationPreference::new);
        if (!preferences.allows(type)) {
            return;
        }

        List<PushDevice> devices = pushDeviceRepository.findByUserId(userId);
        if (devices.isEmpty()) {
            return;
        }

        Map<String, String> data = payload(type, title, body, link, notificationId);
        List<Message> messages = devices.stream()
                .map(device -> buildMessage(device, data, title, body))
                .toList();

        try {
            BatchResponse response = messaging.sendEach(messages);
            if (response.getFailureCount() > 0) {
                pruneDeadTokens(devices, response.getResponses());
            }
        } catch (FirebaseMessagingException e) {
            log.warn("Push delivery to user {} failed: {}", userId, e.getMessage());
        } catch (RuntimeException e) {
            log.warn("Unexpected error delivering push to user {}", userId, e);
        }
    }

    private Map<String, String> payload(NotificationType type, String title, String body,
                                        String link, UUID notificationId) {
        // FCM data values must all be strings, and nulls are rejected outright.
        Map<String, String> data = new HashMap<>();
        data.put("type", type.name());
        data.put("title", title == null ? "CampusMarket" : title);
        data.put("body", body == null ? "" : body);
        data.put("link", link == null ? "/notifications" : link);
        if (notificationId != null) {
            data.put("notificationId", notificationId.toString());
        }
        return data;
    }

    private Message buildMessage(PushDevice device, Map<String, String> data,
                                 String title, String body) {
        Message.Builder builder = Message.builder()
                .setToken(device.getToken())
                .putAllData(data)
                .setWebpushConfig(WebpushConfig.builder()
                        .putHeader("TTL", TTL_SECONDS)
                        .putHeader("Urgency", "high")
                        .build());

        // Native clients have no service worker to render for them, so they get
        // a real notification block. Web deliberately does not - see the class doc.
        if (device.getPlatform() != PushPlatform.WEB) {
            builder.setNotification(com.google.firebase.messaging.Notification.builder()
                    .setTitle(title)
                    .setBody(body)
                    .build());
        }
        return builder.build();
    }

    /**
     * A token dies when the user clears site data, uninstalls, or revokes
     * permission, and FCM says so on the next send. Deleting those rows here is
     * the only garbage collection this table gets - without it every send to a
     * long-lived account slowly turns into a batch of failures.
     */
    private void pruneDeadTokens(List<PushDevice> devices, List<SendResponse> responses) {
        List<PushDevice> dead = new ArrayList<>();
        for (int i = 0; i < responses.size() && i < devices.size(); i++) {
            SendResponse response = responses.get(i);
            if (response.isSuccessful()) {
                continue;
            }
            MessagingErrorCode code = response.getException() == null
                    ? null : response.getException().getMessagingErrorCode();
            if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
                dead.add(devices.get(i));
            } else {
                // Transient (quota, unavailable): keep the token and let the next
                // notification retry it.
                log.debug("Transient push failure for device {}: {}", devices.get(i).getId(), code);
            }
        }
        if (!dead.isEmpty()) {
            pushDeviceRepository.deleteAll(dead);
            log.info("Pruned {} dead push token(s).", dead.size());
        }
    }
}
