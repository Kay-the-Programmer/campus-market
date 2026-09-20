package com.campusmarket.service;

import com.campusmarket.config.AppProperties;
import com.campusmarket.config.AsyncConfig;
import com.campusmarket.domain.NotificationPreference;
import com.campusmarket.domain.NotificationType;
import com.campusmarket.repository.NotificationPreferenceRepository;
import com.campusmarket.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Emails a notification to the user it belongs to.
 *
 * <p>The email counterpart of {@link PushNotificationService}, and built the
 * same way for the same reasons: the row in {@code notifications} is the
 * record, this is one more way of being told about it. It runs after the
 * originating transaction commits and on its own executor, so a checkout never
 * waits on - or fails because of - an SMTP server.
 *
 * <p>It is not a digest. One notification, one email, gated by the user's
 * per-category preferences, which is why MESSAGE is worth thinking about
 * before switching this on for a chatty marketplace: a conversation of twenty
 * messages is twenty emails unless the recipient turns messages off. Batching
 * into a digest would need a scheduler and a "since" watermark, and is the
 * obvious next step if that turns out to be a problem in practice.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationEmailService {

    private final Mailer mailer;
    private final NotificationPreferenceRepository preferenceRepository;
    private final UserRepository userRepository;
    private final AppProperties properties;

    /**
     * @param link in-app path this notification points at, e.g. {@code /orders/123}.
     *             Turned into an absolute URL, because a relative link in an
     *             inbox goes nowhere.
     */
    @Async(AsyncConfig.MAIL_EXECUTOR)
    /*
     * NOT_SUPPORTED: this runs after someone else's transaction committed, on
     * another thread. Joining or starting a transaction would hold a pooled
     * connection open for the length of an SMTP round trip - the connection
     * pool is sized for request handling, and mail is slow enough to exhaust
     * it. The two reads below each manage their own.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void send(UUID userId, NotificationType type, String title, String body, String link) {
        if (userId == null || !mailer.isEnabled()) {
            return;
        }

        NotificationPreference preferences = preferenceRepository.findById(userId)
                .orElseGet(NotificationPreference::new);
        if (!preferences.allowsEmail(type)) {
            return;
        }

        userRepository.findById(userId).ifPresent(user -> {
            String email = user.getEmail();
            if (email == null || email.isBlank()) {
                return;
            }

            String ctaUrl = absolute(link);
            String settingsUrl = absolute("/profile");
            String footerHtml = """
                    You are receiving this because you have email notifications on for
                    CampusMarket. <a href="%s" style="color:#2563eb;">Manage your notification
                    settings</a>.
                    """.formatted(EmailContent.attr(settingsUrl));
            String footerText =
                    "Manage your notification settings: " + settingsUrl;

            String html = EmailContent.page(
                    title, body, body,
                    ctaUrl == null ? null : "Open CampusMarket", ctaUrl,
                    footerHtml);
            String text = EmailContent.text(
                    title, body, ctaUrl == null ? null : "Open CampusMarket", ctaUrl, footerText);

            /*
             * No List-Unsubscribe. That header is for bulk mail, and pointing
             * it at a one-click endpoint here would let a client's "unsubscribe"
             * button silently switch off the email about someone's own order.
             * The settings link in the footer is the right control for this
             * kind of message.
             */
            mailer.send(email, user.getName(), title, html, text, Map.of());
        });
    }

    /**
     * @return an absolute URL, or null when there is nothing to link to or no
     *         base URL is configured - the templates treat null as "no button"
     *         rather than rendering a link to nowhere.
     */
    private String absolute(String path) {
        String base = properties.getAppBaseUrl();
        if (base == null || base.isBlank() || path == null || path.isBlank()) {
            return null;
        }
        String trimmed = base.replaceAll("/+$", "");
        return path.startsWith("/") ? trimmed + path : trimmed + "/" + path;
    }
}
