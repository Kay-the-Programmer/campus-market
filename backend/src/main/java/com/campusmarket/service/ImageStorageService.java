package com.campusmarket.service;

import com.campusmarket.config.AppProperties;
import com.campusmarket.web.error.ApiException;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Writes listing and promo images and hands back the URL that serves them.
 *
 * <p>Both uploads and stored images used to be a single base64 string living
 * inside the same JSON as everything else about a listing - every payload that
 * so much as mentioned a listing carried its photo along, uncacheable and
 * unable to be served by anything but this API. A file addressed by URL can be
 * cached by the browser and reused across requests instead.
 *
 * <p>Two backends, chosen once at startup: Google Cloud Storage when
 * {@code campusmarket.gcs-bucket} is set, local disk otherwise - the same
 * optional-cloud-service shape {@link com.campusmarket.config.FirebaseConfig}
 * already uses, so a contributor with no GCP project can still run the app,
 * and production points at a bucket with no code change. A GCS-served URL is
 * a direct {@code storage.googleapis.com} link the browser fetches on its
 * own, so once configured this API is no longer in the path for serving a
 * single image, only for writing new ones.
 */
@Service
@Slf4j
public class ImageStorageService {

    private static final Map<String, String> EXTENSION_BY_MIME_TYPE = Map.of(
            "image/webp", "webp",
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/gif", "gif");

    private static final String CACHE_CONTROL = "public, max-age=31536000, immutable";

    /**
     * Comfortably above anything the client-side downscale in SellScreen or
     * PromoEditor ever produces (both target well under 1MB). This is a floor
     * against abuse, not the expected size.
     */
    private static final long MAX_BYTES = 8L * 1024 * 1024;

    private final ObjectProvider<Storage> gcsProvider;
    private final String gcsBucket;
    private final Path localRoot;

    public ImageStorageService(ObjectProvider<Storage> gcsProvider,
                               AppProperties properties,
                               @Value("${campusmarket.uploads-dir}") String uploadsDir) {
        this.gcsProvider = gcsProvider;
        this.gcsBucket = properties.getGcsBucket();
        this.localRoot = Paths.get(uploadsDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(localRoot);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not create the uploads directory: " + localRoot, e);
        }
    }

    /** The live upload endpoint - a photo a seller or admin just picked. */
    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("EMPTY_FILE", "Choose an image to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("IMAGE_TOO_LARGE",
                    "That image is too large. Use a smaller or more compressed one.");
        }
        String mimeType = requireSupportedMimeType(file.getContentType());
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the uploaded file.", e);
        }
        return write(bytes, mimeType);
    }

    /**
     * The one-time backfill of images that predate this endpoint - decodes a
     * {@code data:image/...;base64,...} string that server-side validation has
     * already accepted once, so a bad prefix here is a genuine data problem
     * worth failing loudly on rather than a case to handle quietly.
     */
    public String storeDataUri(String dataUri) {
        int comma = dataUri.indexOf(',');
        if (comma < 0 || !dataUri.startsWith("data:")) {
            throw new IllegalArgumentException("Not a data URI: " + truncate(dataUri));
        }
        String header = dataUri.substring("data:".length(), comma);
        String mimeType = requireSupportedMimeType(header.split(";")[0]);
        byte[] bytes = Base64.getDecoder().decode(dataUri.substring(comma + 1));
        return write(bytes, mimeType);
    }

    private String write(byte[] bytes, String mimeType) {
        String filename = UUID.randomUUID() + "." + EXTENSION_BY_MIME_TYPE.get(mimeType);
        Storage gcs = gcsProvider.getIfAvailable();
        return (gcs != null && gcsBucket != null && !gcsBucket.isBlank())
                ? writeToGcs(gcs, filename, bytes, mimeType)
                : writeToLocalDisk(filename, bytes);
    }

    private String writeToGcs(Storage gcs, String filename, byte[] bytes, String mimeType) {
        BlobInfo blobInfo = BlobInfo.newBuilder(BlobId.of(gcsBucket, filename))
                .setContentType(mimeType)
                .setCacheControl(CACHE_CONTROL)
                .build();
        try {
            gcs.create(blobInfo, bytes);
        } catch (StorageException e) {
            // A configured-but-failing bucket fails loudly rather than
            // quietly falling back to disk - a half-GCS, half-local set of
            // images would be a confusing thing to debug later. The
            // fallback only ever applies when GCS was never configured.
            log.error("Could not upload image to gs://{}/{}", gcsBucket, filename, e);
            throw new UncheckedIOException("Could not upload the image to Cloud Storage.", new IOException(e));
        }
        return "https://storage.googleapis.com/" + gcsBucket + "/" + filename;
    }

    private String writeToLocalDisk(String filename, byte[] bytes) {
        Path target = localRoot.resolve(filename);
        try {
            Files.write(target, bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save the image.", e);
        }
        return "/api/uploads/" + filename;
    }

    private String requireSupportedMimeType(String mimeType) {
        String normalised = mimeType == null ? null : mimeType.toLowerCase(Locale.ROOT);
        if (normalised == null || !EXTENSION_BY_MIME_TYPE.containsKey(normalised)) {
            throw ApiException.badRequest("UNSUPPORTED_IMAGE_TYPE",
                    "Upload a JPEG, PNG, WebP or GIF image.");
        }
        return normalised;
    }

    private String truncate(String s) {
        return s == null ? "null" : s.length() <= 40 ? s : s.substring(0, 40) + "...";
    }
}
