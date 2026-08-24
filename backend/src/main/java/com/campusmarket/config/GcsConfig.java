package com.campusmarket.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Wires up a Google Cloud Storage client for {@link com.campusmarket.service.ImageStorageService}.
 *
 * <p>Optional in exactly the shape {@link FirebaseConfig} already uses: with
 * no bucket configured this publishes no usable {@link Storage}, and image
 * uploads fall back to local disk - a bucket is an enhancement over that
 * default, not a dependency the API refuses to start without.
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class GcsConfig {

    private final AppProperties properties;

    /**
     * Returns {@code null} when no bucket is configured. Spring registers
     * that as a resolvable-but-empty bean, so {@code ImageStorageService}
     * injects it via {@code ObjectProvider<Storage>} and checks for null -
     * same rule as {@code FirebaseApp} in {@link FirebaseConfig}.
     */
    @Bean
    public Storage gcsStorage() {
        String bucket = properties.getGcsBucket();
        if (bucket == null || bucket.isBlank()) {
            log.info("CAMPUSMARKET_GCS_BUCKET is not set - image uploads are stored on local disk.");
            return null;
        }
        try {
            StorageOptions.Builder options = StorageOptions.newBuilder();
            GoogleCredentials credentials = resolveCredentials();
            if (credentials != null) {
                options.setCredentials(credentials);
            }
            // No explicit credentials falls through to StorageOptions' own
            // default resolution: GOOGLE_APPLICATION_CREDENTIALS or ambient
            // Application Default Credentials.
            return options.build().getService();
        } catch (Exception e) {
            // Misconfiguration must not take the whole API down - only image
            // uploads degrade, back to local disk.
            log.error("Failed to initialise Google Cloud Storage - image uploads fall back to local disk.", e);
            return null;
        }
    }

    private GoogleCredentials resolveCredentials() {
        String json = properties.getGcsCredentialsJson();
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return GoogleCredentials.fromStream(
                    new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException e) {
            log.error("CAMPUSMARKET_GCS_CREDENTIALS_JSON is set but is not a valid service-account key.", e);
            return null;
        }
    }
}
