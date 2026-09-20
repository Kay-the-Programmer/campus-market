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

    /**
     * Browser origins allowed to call this API - i.e. where the frontend is
     * served from, not this API's own domain.
     *
     * <p>Deliberately empty here. The default lives in application.yml, which
     * always binds over whatever is written as a field initialiser, so a list
     * in both places is a list in one place plus a decoy - and the two had
     * already drifted apart. {@link WebConfig} logs what it resolved.
     */
    private List<String> corsOrigins = List.of();

    /**
     * Whether to seed sample demo listings and demo customer/seller users on an empty database.
     * In production deployment, set to false so only categories and the admin account are created.
     */
    private boolean seedDemoData = true;

    /**
     * The administrator account, reconciled against these three values on
     * every boot by {@link DataSeeder} - created when the email is not yet
     * present, and kept in step with the configured name when it is.
     */
    private String adminEmail = "admin@campus.edu";

    /**
     * Blank by default, and deliberately so.
     *
     * <p>This used to default to a literal password, which meant an operator
     * who never set the environment variable got an administrator account on
     * a public site with a credential published in this repository. Left
     * blank now, no administrator is created at all and startup says so - an
     * obvious missing account beats a silently guessable one. The production
     * compose overlay requires the variable outright.
     */
    private String adminPassword = "";

    private String adminName = "Campus Marketplace Admin";

    /**
     * Rotate the existing administrator's password to {@link #adminPassword}
     * on the next boot.
     *
     * <p>Off by default because the alternative - reapplying the configured
     * password on every restart - would silently undo a password the
     * administrator had changed in the app, and a deploy is a bad moment to
     * discover that. Set it, restart, then unset it again.
     */
    private boolean adminPasswordReset = false;

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
