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
     * What a delivery attempt actually did.
     *
     * <p>Exists because {@link #send} cannot report anything: it is fire-and-
     * forget by design, returns before FCM has answered, and swallows every
     * failure so that a notification nobody receives can never roll back the
     * thing that produced it. That is right for ordinary sends and useless when
     * the question is "why is nothing arriving?", which is what this answers.
     *
     * @param reason why nothing was sent, when {@code devices} is 0 or sending
     *               was not attempted at all. Null when a send was made.
     * @param failures one line per device FCM refused, carrying its error code -
     *                 the code is the diagnosis. SENDER_ID_MISMATCH or
     *                 THIRD_PARTY_AUTH_ERROR means the server holds credentials
     *                 for a different Firebase project than the one that issued
     *                 the browser's token; UNREGISTERED means the device really
     *                 is gone and the row has just been removed.
     */
    public record SendOutcome(boolean configured, int devices, int sent,
                              List<String> failures, String reason) {}

    /**
     * Sends a notification to one user's own devices and reports what happened.
     *
     * <p>Synchronous, unlike {@link #send}: the entire point is that the caller
     * waits for FCM's answer and is told it.
     */
    @Transactional
    public SendOutcome sendTest(UUID userId, String title, String body) {
        FirebaseMessaging messaging = messagingProvider.getIfAvailable();
        if (messaging == null) {
            return new SendOutcome(false, 0, 0, List.of(),
                    "The server has no Firebase credentials, so it cannot send push at all. "
                            + "Check CAMPUSMARKET_FIREBASE_CREDENTIALS_JSON.");
        }

        List<PushDevice> devices = pushDeviceRepository.findByUserId(userId);
        if (devices.isEmpty()) {
            return new SendOutcome(true, 0, 0, List.of(),
                    "No device is registered for this account. Turn notifications on in this "
                            + "browser first - on an iPhone, the site has to be on the Home Screen.");
        }

        Map<String, String> data = payload(NotificationType.SYSTEM, title, body, "/notifications", null);
        List<Message> messages = devices.stream()
                .map(device -> buildMessage(device, data, title, body))
                .toList();

        try {
            BatchResponse response = messaging.sendEach(messages);
            List<String> failures = new ArrayList<>();
            for (int i = 0; i < response.getResponses().size() && i < devices.size(); i++) {
                SendResponse each = response.getResponses().get(i);
                if (each.isSuccessful()) {
                    continue;
                }
                MessagingErrorCode code = each.getException() == null
                        ? null : each.getException().getMessagingErrorCode();
                failures.add(devices.get(i).getPlatform() + ": " + code);
            }
            if (response.getFailureCount() > 0) {
                pruneDeadTokens(devices, response.getResponses());
            }
            log.info("Test push for user {}: {} device(s), {} delivered, {} refused.",
                    userId, devices.size(), response.getSuccessCount(), response.getFailureCount());
            return new SendOutcome(true, devices.size(), response.getSuccessCount(), failures, null);
        } catch (FirebaseMessagingException e) {
            log.warn("Test push for user {} failed outright: {}", userId, e.getMessage());
            return new SendOutcome(true, devices.size(), 0,
                    List.of(String.valueOf(e.getMessagingErrorCode())),
                    "Firebase refused the request: " + e.getMessage());
        }
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
                /*
                 * Keep the token and let the next notification retry it - the
                 * usual causes here are quota and unavailability, which pass.
                 *
                 * Logged at warn, not debug. Not everything that lands here is
                 * transient: SENDER_ID_MISMATCH and THIRD_PARTY_AUTH_ERROR mean
                 * the server is authenticating as the wrong Firebase project,
                 * which never recovers on its own and is the one failure that
                 * silences push completely. At debug it was invisible at the
                 * level anything actually runs at, so the symptom was "no
                 * notifications" with a clean log.
                 */
                log.warn("Push to device {} failed with {} - not a dead token, keeping it.",
                        devices.get(i).getId(), code);
            }
        }
        if (!dead.isEmpty()) {
            pushDeviceRepository.deleteAll(dead);
            log.info("Pruned {} dead push token(s).", dead.size());
        }
    }
}
