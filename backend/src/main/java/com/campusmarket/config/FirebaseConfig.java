package com.campusmarket.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.messaging.FirebaseMessaging;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Wires up the Firebase Admin SDK, used for two things: verifying Google ID
 * tokens for "Continue with Google" (a variant of workflow 1), and sending push
 * notifications through FCM.
 *
 * <p>Both are optional, not hard dependencies: with no credentials configured
 * this publishes no usable {@link FirebaseAuth} or {@link FirebaseMessaging},
 * {@code AuthService.googleSignIn} answers 503, and push delivery quietly does
 * nothing - rather than the whole API refusing to start over a login method and
 * a notification transport it can live without.
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class FirebaseConfig {

    private final AppProperties properties;

    /**
     * Returns {@code null} when Firebase isn't configured. Spring registers
     * that as a resolvable-but-empty bean, so callers must inject it via
     * {@code ObjectProvider<FirebaseApp>} and check for null - a direct
     * {@code @Autowired FirebaseApp} field would fail to wire.
     */
    @Bean
    public FirebaseApp firebaseApp() {
        try {
            GoogleCredentials credentials = resolveCredentials();
            if (credentials == null) {
                log.warn("No Firebase credentials configured - \"Continue with Google\" and push "
                        + "notifications are disabled. Set CAMPUSMARKET_FIREBASE_CREDENTIALS_JSON "
                        + "to enable them.");
                return null;
            }

            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(credentials)
                    .build();

            return FirebaseApp.getApps().isEmpty()
                    ? FirebaseApp.initializeApp(options)
                    : FirebaseApp.getInstance();
        } catch (Exception e) {
            // Misconfigured credentials must not take the whole API down -
            // only the optional Firebase-backed paths degrade.
            log.error("Failed to initialise the Firebase Admin SDK - "
                    + "\"Continue with Google\" and push notifications are disabled.", e);
            return null;
        }
    }

    /**
     * Null when {@link #firebaseApp()} is - same injection rules apply. The
     * dependency comes in as an {@code ObjectProvider} for that reason: a plain
     * {@code FirebaseApp} parameter cannot be satisfied by a null bean.
     */
    @Bean
    public FirebaseAuth firebaseAuth(ObjectProvider<FirebaseApp> app) {
        FirebaseApp instance = app.getIfAvailable();
        return instance == null ? null : FirebaseAuth.getInstance(instance);
    }

    /**
     * The FCM transport behind {@code PushNotificationService}. Null when
     * Firebase isn't configured, in which case notifications are still written
     * to the database and shown in-app - only the device wake-up is lost.
     */
    @Bean
    public FirebaseMessaging firebaseMessaging(ObjectProvider<FirebaseApp> app) {
        FirebaseApp instance = app.getIfAvailable();
        return instance == null ? null : FirebaseMessaging.getInstance(instance);
    }

    private GoogleCredentials resolveCredentials() {
        String json = properties.getFirebaseCredentialsJson();
        if (json != null && !json.isBlank()) {
            try {
                return GoogleCredentials.fromStream(
                        new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
            } catch (IOException e) {
                log.error("CAMPUSMARKET_FIREBASE_CREDENTIALS_JSON is set but is not a valid service-account key.", e);
                return null;
            }
        }
        // Falls back to GOOGLE_APPLICATION_CREDENTIALS (a mounted key file
        // path) or any other ambient credential source the environment offers.
        try {
            return GoogleCredentials.getApplicationDefault();
        } catch (IOException e) {
            return null;
        }
    }
}
