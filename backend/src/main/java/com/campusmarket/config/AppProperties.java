package com.campusmarket.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "campusmarket")
@Getter
@Setter
public class AppProperties {

    /**
     * Dev-only. Returns verification / reset tokens in API responses so the
     * email-driven flows can be exercised without a mail provider. Never enable
     * in production - it would let anyone verify or reset any account.
     */
    private boolean exposeDevTokens = false;

    private List<String> corsOrigins = List.of(
            "http://localhost:3000",
            "http://localhost:5173",
            "https://salepilot.space",
            "https://www.salepilot.space",
            "https://campus-market-mu.vercel.app",
            "https://www.campus-market-mu.vercel.app"
    );

    /**
     * Whether to seed sample demo listings and demo customer/seller users on an empty database.
     * In production deployment, set to false so only categories and the admin account are created.
     */
    private boolean seedDemoData = true;

    private String adminEmail = "admin@campus.edu";

    private String adminPassword = "Admin123!";

    private String adminName = "Campus Marketplace Admin";

    private int sessionTtlDays = 14;

    private int verificationTokenTtlMinutes = 1440;

    private int resetTokenTtlMinutes = 30;

    private int resendCooldownSeconds = 60;

    private int maxFailedLogins = 5;

    private int loginLockoutMinutes = 15;

    /**
     * Per-IP throttling, enforced by {@link com.campusmarket.security.RateLimitFilter}.
     * Off by default so a local run is never throttled mid edit-reload-retry;
     * the production compose file turns it on.
     */
    private boolean rateLimitEnabled = false;

    /**
     * Requests per minute per IP to {@code /api/auth/*}. Low on purpose - these
     * endpoints send mail, create accounts and mint sessions, and no honest
     * person signs in twenty times a minute.
     */
    private int rateLimitAuthPerMinute = 20;

    /**
     * Requests per minute per IP for every other write. Loose enough not to
     * interrupt someone listing items quickly, tight enough to stop a script.
     */
    private int rateLimitWritePerMinute = 120;

    /**
     * Where uploaded listing and promo images are written on disk. Relative
     * paths resolve against the working directory - {@code /app} in the
     * container image, which is why the Docker Compose file mounts a volume
     * there and points this at it, so images survive a container recreate.
     */
    private String uploadsDir = "uploads";

    /**
     * Full contents of a Firebase service-account key file (JSON), used to
     * verify Google ID tokens for "Continue with Google". Left blank, Google
     * sign-in is simply disabled - it's an optional login method, not a
     * dependency the app requires to start. GOOGLE_APPLICATION_CREDENTIALS
     * (a mounted key file path) works too and takes over when this is blank.
     */
    private String firebaseCredentialsJson;

    /**
     * Google Cloud Storage bucket for listing and promo images. Left blank,
     * ImageStorageService writes to local disk instead (see uploadsDir) - a
     * bucket is an enhancement over that, not something the app requires to
     * run, the same way Google sign-in above is optional.
     */
    private String gcsBucket = "";

    /**
     * Full contents of a service-account key file (JSON) authorised to write
     * to gcsBucket. Left blank, falls back to GOOGLE_APPLICATION_CREDENTIALS
     * (a mounted key file path) or ambient Application Default Credentials -
     * the same two-step resolution firebaseCredentialsJson uses, and commonly
     * the same key file, since one service account can hold both roles.
     */
    private String gcsCredentialsJson;
}
