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
     * Inserted the same way to name the phone-sized rendition.
     *
     * <p>Two card sizes rather than one because a single file cannot serve
     * both well: a browse tile is about 170 CSS pixels on a phone and about
     * 290 on a wide screen, so the thumbnail sized for the second is roughly
     * four times the pixels the first needs. That is the difference between
     * about 50KB and about 15KB per tile, on a grid that draws two dozen of
     * them, for someone who is most likely on the worse connection of the
     * two. The browser picks between them from the srcset the frontend
     * emits; see SMALL_MAX_EDGE in utils/images.ts.
     */
    public static final String SMALL_SUFFIX = ".small";

    /**
     * Inserted the same way to name the list-row rendition.
     *
     * <p>Search suggestions, cart lines, order items and message threads draw
     * a photo at 36 to 48 CSS pixels. The card sizes above are the wrong tool
     * for that by more than an order of magnitude, and with only those two in
     * the srcset the browser has nothing smaller to choose. See TINY_MAX_EDGE
     * in utils/images.ts.
     */
    public static final String TINY_SUFFIX = ".tiny";

    /**
     * A stored image, addressed by the URL of its full-size version.
     *
     * @param url      what to persist and serve - the full image
     * @param thumbUrl the card-size version, or null when the client sent none
     * @param smallUrl the phone-size version, or null when the client sent none
     * @param tinyUrl  the list-row version, or null when the client sent none.
     *                 Older clients send none of these, which is why they are
     *                 nullable rather than merely optional in practice.
     */
    public record Stored(String url, String thumbUrl, String smallUrl, String tinyUrl) {}

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
     * <p>All parts share one id, so every rendition is findable from the full
     * image's URL by convention and nothing else has to remember they exist.
     * A client that sends only some of them - an older bundle still in
     * someone's cache mid-deploy - stores what it sent and nothing breaks.
     */
    public Stored store(MultipartFile file, MultipartFile thumb, MultipartFile small,
                        MultipartFile tiny) {
        byte[] bytes = readPart(file, "Choose an image to upload.");
        String mimeType = requireSupportedMimeType(file.getContentType());
        String id = UUID.randomUUID().toString();

        // The extension follows what was actually encoded, never what arrived.
        Encoded encoded = toWebp(bytes, mimeType);
        String url = write(id + "." + EXTENSION_BY_MIME_TYPE.get(encoded.mimeType()), encoded.bytes());

        /*
         * A derived rendition that fails must not fail the upload. The full
         * image is what the listing needs; these are speed-ups, and the
         * frontend degrades to the next size up when one is missing. Logged so
         * a systematic problem is visible, not surfaced to the seller who just
         * successfully uploaded a photo.
         */
        String thumbUrl = writeVariant(id, THUMB_SUFFIX, thumb, "Thumbnail");
        String smallUrl = writeVariant(id, SMALL_SUFFIX, small, "Small rendition");
        String tinyUrl = writeVariant(id, TINY_SUFFIX, tiny, "Tiny rendition");

        return new Stored(url, thumbUrl, smallUrl, tinyUrl);
    }

    /**
     * Stores one optional derived rendition beside its full image.
     *
     * @return the URL it was written to, or null if it was absent or rejected
     */
    private String writeVariant(String id, String suffix, MultipartFile part, String label) {
        if (part == null || part.isEmpty()) {
            return null;
        }
        try {
            byte[] bytes = readPart(part, "");
            String type = requireSupportedMimeType(part.getContentType());
            Encoded encoded = toWebp(bytes, type);
            return write(id + suffix + "." + EXTENSION_BY_MIME_TYPE.get(encoded.mimeType()),
                    encoded.bytes());
        } catch (ApiException e) {
            log.warn("{} for {} rejected ({}); the full image was stored", label, id, e.getMessage());
            return null;
        }
    }


    /* ─────────────────────── WebP normalisation ─────────────────────────
     *
     * Everything that lands on disk is WebP, whatever the client managed to
     * encode.
     *
     * The browser already tries: utils/images.ts renders each rendition to
     * WebP and only falls back to JPEG where the canvas cannot encode it.
     * That covers most uploads and costs this server nothing, because an
     * incoming WebP is passed straight through untouched.
     *
     * It is not a guarantee, though, and the live site is the proof - its
     * photos were multi-megabyte PNGs. A client-side encode depends on the
     * browser that happens to be uploading, on that browser having the
     * current bundle rather than a cached older one, and on the upload having
     * come through the app at all rather than through storeDataUri or an API
     * client. This is the backstop that makes the format a property of the
     * store rather than a hope about the caller.
     *
     * Deliberately best-effort. Every failure path here - no cwebp on the
     * box, a non-zero exit, a hang, output that came back larger than the
     * input - keeps the original bytes and stores those. An image that is
     * merely bigger than it could have been is a slow page; an upload that
     * 500s because a codec misbehaved is a seller who cannot list.
     */

    private static final String WEBP_MIME = "image/webp";

    /**
     * Quality for the server-side encode.
     *
     * <p>82 rather than something lower because this input has usually been
     * through a lossy encode already: the client downscales and compresses
     * before uploading, so re-encoding is a second generation and the
     * artefacts compound. High enough that the second pass is invisible,
     * while still well under what a PNG of the same picture costs.
     */
    private static final int WEBP_QUALITY = 82;

    /** A hung codec must not hold a request thread open indefinitely. */
    private static final long CWEBP_TIMEOUT_SECONDS = 20;

    /** Probed once on first use; null until then. See {@link #cwebpAvailable()}. */
    private volatile Boolean cwebpAvailable;

    /** Bytes to store and the type they actually are, after any conversion. */
    private record Encoded(byte[] bytes, String mimeType) {}

    /**
     * Is cwebp on this box?
     *
     * <p>Probed lazily and cached, rather than checked per upload: the answer
     * cannot change while the process runs, and spawning a process to ask
     * would double the cost of every conversion. A machine without it - a
     * developer running the jar outside the container - logs once and stores
     * what it was given.
     */
    private boolean cwebpAvailable() {
        Boolean known = cwebpAvailable;
        if (known != null) {
            return known;
        }
        synchronized (this) {
            if (cwebpAvailable == null) {
                boolean found = false;
                try {
                    Process probe = new ProcessBuilder("cwebp", "-version")
                            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                            .redirectError(ProcessBuilder.Redirect.DISCARD)
                            .start();
                    found = probe.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)
                            && probe.exitValue() == 0;
                } catch (IOException | InterruptedException e) {
                    if (e instanceof InterruptedException) {
                        Thread.currentThread().interrupt();
                    }
                }
                if (!found) {
                    log.warn("cwebp is not available; images will be stored in the format they "
                            + "arrive in. Install libwebp-tools to convert uploads to WebP.");
                }
                cwebpAvailable = found;
            }
            return cwebpAvailable;
        }
    }

    /**
     * Converts one image to WebP, or returns it unchanged.
     *
     * <p>Via temp files rather than the process's own streams. cwebp reads
     * stdin and writes stdout happily enough, but doing both from one thread
     * deadlocks the moment either pipe's buffer fills - and an image is
     * comfortably larger than a pipe buffer.
     */
    private Encoded toWebp(byte[] bytes, String mimeType) {
        if (WEBP_MIME.equals(mimeType) || !cwebpAvailable()) {
            return new Encoded(bytes, mimeType);
        }

        Path in = null;
        Path out = null;
        try {
            in = Files.createTempFile("cm-src-", ".img");
            out = Files.createTempFile("cm-out-", ".webp");
            Files.write(in, bytes);

            Process process = new ProcessBuilder(
                    "cwebp", "-quiet", "-q", String.valueOf(WEBP_QUALITY), "-m", "4",
                    in.toString(), "-o", out.toString())
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();

            if (!process.waitFor(CWEBP_TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS)) {
                process.destroyForcibly();
                log.warn("cwebp timed out after {}s; storing the original", CWEBP_TIMEOUT_SECONDS);
                return new Encoded(bytes, mimeType);
            }
            if (process.exitValue() != 0) {
                log.warn("cwebp exited {}; storing the original", process.exitValue());
                return new Encoded(bytes, mimeType);
            }

            byte[] converted = Files.readAllBytes(out);
            /*
             * Never make a file bigger. An image the client already encoded
             * well - a small JPEG, or a flat graphic PNG compresses better
             * than WebP's lossy mode - can come back larger, and storing that
             * would be paying a second generation of loss for negative gain.
             */
            if (converted.length == 0 || converted.length >= bytes.length) {
                return new Encoded(bytes, mimeType);
            }
            return new Encoded(converted, WEBP_MIME);
        } catch (IOException e) {
            log.warn("Could not convert an image to WebP ({}); storing the original", e.toString());
            return new Encoded(bytes, mimeType);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Encoded(bytes, mimeType);
        } finally {
            deleteQuietly(in);
            deleteQuietly(out);
        }
    }

    private void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.debug("Could not remove temp file {}: {}", path, e.toString());
        }
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
        // it to make one, and cards fall back to the full image. It is still
        // converted - these inline images are the oldest in the system and the
        // likeliest to be a PNG of a photograph.
        Encoded encoded = toWebp(bytes, mimeType);
        return write(UUID.randomUUID() + "." + EXTENSION_BY_MIME_TYPE.get(encoded.mimeType()),
                encoded.bytes());
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
