package com.campusmarket.service;

import com.campusmarket.web.error.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Writes listing and promo images to local disk and hands back the URL that
 * serves them.
 *
 * <p>Both uploads and stored images used to be a single base64 string living
 * inside the same JSON as everything else about a listing - every payload that
 * so much as mentioned a listing carried its photo along, uncacheable and
 * unable to be served by anything but this API. A file addressed by URL can be
 * cached by the browser and reused across requests instead.
 *
 * <p>Local disk is the only backend. There used to be a second, Google Cloud
 * Storage, chosen when a bucket was configured. It was removed after it took
 * every upload down with a 500 for a reason no code could fix - the GCP
 * project's billing account was suspended - while the app had a perfectly
 * good disk it could have written to. A dependency on a metered cloud service
 * for something a directory does is a failure mode, not a feature. The files
 * live in a Docker volume (see docker-compose.yml) and are served by
 * {@code WebConfig#addResourceHandlers} at {@code /api/uploads/**}, which
 * rides the same edge proxy and CORS rules as everything else.
 *
 * <p>What "always works" means here, concretely:
 * <ul>
 *   <li>The directory is created and <em>proven writable</em> at startup, not
 *       discovered unwritable on the first upload. A broken volume shows up in
 *       the startup log with the path and the fix.</li>
 *   <li>Every failure the caller can see is a specific {@link ApiException}
 *       with a status and a message, never a bare 500 from an unchecked
 *       exception.</li>
 *   <li>Filenames are random UUIDs, so nothing the client sends can name a
 *       path, and a URL is either not written yet or never changes.</li>
 * </ul>
 */
@Service
@Slf4j
public class ImageStorageService {

    private static final Map<String, String> EXTENSION_BY_MIME_TYPE = Map.of(
            "image/webp", "webp",
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/gif", "gif");

    /**
     * Comfortably above anything the client-side downscale in SellScreen or
     * PromoEditor ever produces (both target well under 1MB). This is a floor
     * against abuse, not the expected size. Kept below Spring's multipart
     * limit (10MB in application.yml) so this check, with its clear message,
     * is the one that fires rather than the framework's.
     */
    private static final long MAX_BYTES = 8L * 1024 * 1024;

    private final Path root;

    /**
     * Set once at startup by {@link #probeWritable()}. When false, uploads
     * answer 503 with the reason instead of attempting a write that will fail.
     */
    private final boolean writable;

    public ImageStorageService(@Value("${campusmarket.uploads-dir}") String uploadsDir) {
        this.root = Paths.get(uploadsDir).toAbsolutePath().normalize();
        this.writable = probeWritable();
    }

    /**
     * Creates the directory and writes-then-deletes a probe file in it.
     *
     * <p>Existence is not enough. The directory is a volume mount point, so it
     * always exists; the question is whether the container's user can write
     * to it, and the only way to know is to try. A volume created outside the
     * normal path - by hand, or on a host where the image's ownership was not
     * copied in - is root-owned, and the app runs as a non-root user. Finding
     * that out here, with the path in the log, beats finding it out from a
     * seller's failed upload.
     *
     * <p>Logged and remembered rather than thrown: the rest of the app works
     * without uploads, and taking the whole site down over a permissions
     * problem on one directory is a worse outcome than a clear 503 on the one
     * feature affected.
     */
    private boolean probeWritable() {
        try {
            Files.createDirectories(root);
            Path probe = root.resolve(".write-probe-" + UUID.randomUUID());
            Files.write(probe, new byte[0], StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            Files.deleteIfExists(probe);
            log.info("Image uploads: local disk at {}", root);
            return true;
        } catch (IOException | SecurityException e) {
            log.error("""
                    Image uploads are DISABLED: {} is not writable ({}).
                    Uploads will answer 503 until this is fixed. On the VM, the directory is
                    the campusmarket-uploads volume; the container runs as user 'app'. Check:
                      docker exec campusmarket-api ls -ld {}
                    A root-owned directory there means the volume was created without the
                    image's ownership. Fix with:
                      docker exec -u root campusmarket-api chown -R app:app {}
                    """, root, e.toString(), root, root);
            return false;
        }
    }

    /**
     * Suffix that turns a stored image's name into its thumbnail's name.
     *
     * <p>Convention rather than a database column, deliberately. The full
     * image's URL is what listings and promos store; the thumbnail's URL is
     * derived from it by anyone who wants it, on either side of the API. That
     * keeps the thumbnail entirely out of the data model - no migration, no
     * DTO field, no mapper change - and means an image without a thumbnail
     * (there are none yet, but there could be) degrades to the full image
     * rather than to a broken one. See {@code thumbnailUrl} in the frontend's
     * utils/images.ts for the other half.
     */
    public static final String THUMB_SUFFIX = ".thumb";

    /**
     * A stored image, addressed by the URL of its full-size version.
     *
     * @param url      what to persist and serve - the full image
     * @param thumbUrl the small version for cards and lists, or null when
     *                 the client sent none
     */
    public record Stored(String url, String thumbUrl) {}

    /**
     * The live upload endpoint - a photo a seller or admin just picked, with
     * an optional thumbnail rendered by the same client.
     *
     * <p>The thumbnail is made client-side, not here. The browser already has
     * the decoded image on a canvas to produce the full-size upload; drawing
     * it a second time at card size costs nothing. Doing it on the server
     * would need an image library that can decode WebP - which the JDK's
     * ImageIO cannot - and a native codec on a small VM, for work the client
     * has already done.
     *
     * <p>Both parts share one id, so the thumbnail is always findable from
     * the full image's URL and nothing else has to remember it exists.
     */
    public Stored store(MultipartFile file, MultipartFile thumb) {
        byte[] bytes = readPart(file, "Choose an image to upload.");
        String mimeType = requireSupportedMimeType(file.getContentType());
        String id = UUID.randomUUID().toString();

        String url = write(id + "." + EXTENSION_BY_MIME_TYPE.get(mimeType), bytes);

        String thumbUrl = null;
        if (thumb != null && !thumb.isEmpty()) {
            /*
             * A thumbnail that fails must not fail the upload. The full image
             * is what the listing needs; the thumbnail is a speed-up, and
             * cards fall back to the full image when it is missing. Logged so
             * a systematic problem is visible, not surfaced to the seller who
             * just successfully uploaded a photo.
             */
            try {
                byte[] thumbBytes = readPart(thumb, "");
                String thumbType = requireSupportedMimeType(thumb.getContentType());
                thumbUrl = write(id + THUMB_SUFFIX + "." + EXTENSION_BY_MIME_TYPE.get(thumbType), thumbBytes);
            } catch (ApiException e) {
                log.warn("Thumbnail for {} rejected ({}); the full image was stored", id, e.getMessage());
            }
        }
        return new Stored(url, thumbUrl);
    }

    /** Validates and reads one multipart part, with the caller's message for the empty case. */
    private byte[] readPart(MultipartFile part, String emptyMessage) {
        if (part == null || part.isEmpty()) {
            throw ApiException.badRequest("EMPTY_FILE", emptyMessage);
        }
        if (part.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("IMAGE_TOO_LARGE",
                    "That image is too large. Use a smaller or more compressed one.");
        }
        try {
            return part.getBytes();
        } catch (IOException e) {
            // The upload was cut off mid-transfer. The client's problem, and
            // retryable - not a server fault worth a 500.
            throw ApiException.badRequest("UPLOAD_INTERRUPTED",
                    "The upload did not complete. Please try again.");
        }
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
        // No thumbnail for a backfilled legacy image: nothing here can decode
        // it to make one, and cards fall back to the full image.
        return write(UUID.randomUUID() + "." + EXTENSION_BY_MIME_TYPE.get(mimeType), bytes);
    }

    private String write(String filename, byte[] bytes) {
        if (!writable) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "UPLOADS_UNAVAILABLE",
                    "Image uploads are temporarily unavailable. Please try again later.", Map.of());
        }

        Path target = root.resolve(filename);
        try {
            // CREATE_NEW: a UUID collision is astronomically unlikely, but if
            // it ever happened, silently overwriting someone else's image is
            // the one outcome worse than failing.
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException e) {
            // The probe passed at startup, so this is something that changed
            // since - almost always a full disk. Say so, in the log with the
            // path and to the caller as a retryable 503, rather than a 500
            // that reads as a bug.
            log.error("Could not write image to {}: {}", target, e.toString());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "UPLOAD_FAILED",
                    "The image could not be saved. Please try again in a moment.", Map.of());
        }
        return "/api/uploads/" + filename;
    }

    /** The path prefix every image this service serves is addressed under. */
    public static final String SERVED_PREFIX = "/api/uploads/";

    /**
     * The form an image URL is stored in: relative for anything this API
     * serves, untouched for anything else.
     *
     * <p>The frontend turns {@code /api/uploads/x.jpg} into an absolute URL on
     * its own origin so the browser fetches it from the API rather than from
     * Vercel - and then, on an edit, sends the listing's images straight
     * back. Without this, the first edit after any upload would persist the
     * absolute form, and the API's public hostname would be baked into every
     * row that was ever edited. Moving domains, or fronting the API with a
     * CDN, would then mean a data migration. Stripping the origin here keeps
     * the stored value the same whether it came from the upload response or
     * a round trip through the client, so the database never learns where it
     * is hosted.
     *
     * <p>Applied at the write sites for listings and promos rather than by
     * validating and rejecting: a client that sends the absolute form is not
     * doing anything wrong, and there is nothing useful to say to it.
     */
    public static String toStoredForm(String url) {
        if (url == null) {
            return null;
        }
        int at = url.indexOf(SERVED_PREFIX);
        // > 0, not >= 0: at 0 it is already relative and there is nothing to do.
        return at > 0 ? url.substring(at) : url;
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
