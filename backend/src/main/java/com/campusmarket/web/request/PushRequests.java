package com.campusmarket.web.request;

public final class PushRequests {
    private PushRequests() {}

    /**
     * @param token    the FCM registration token for this browser/app install
     * @param platform WEB when omitted; anything unrecognised falls back to WEB
     * @param label    optional user-agent string, shown only so a user can tell
     *                 their own devices apart
     */
    public record RegisterDeviceRequest(String token, String platform, String label) {}

    public record UnregisterDeviceRequest(String token) {}

    /**
     * Every field is nullable: null means "leave this one alone", so the UI can
     * PUT a single flipped toggle.
     */
    public record NotificationPreferencesRequest(
            Boolean pushEnabled,
            Boolean messages,
            Boolean orders,
            Boolean reviews,
            Boolean priceDrops,
            Boolean systemUpdates
    ) {}
}
