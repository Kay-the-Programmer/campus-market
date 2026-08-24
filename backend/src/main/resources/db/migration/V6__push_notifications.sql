-- Push notifications: the delivery side of the notifications table.
--
-- A row in `notifications` is what the user sees when they open the app. These
-- two tables answer the other two questions: which devices to wake, and which
-- kinds of activity are worth waking them for.

-- One row per browser/app install that has granted permission. Tokens are
-- issued by FCM, rotate on their own, and are UNIQUE because a token identifies
-- a device install, not a person: when a shared laptop switches accounts the
-- registration is reassigned rather than duplicated (see PushDeviceService).
CREATE TABLE push_devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT        NOT NULL UNIQUE,
    platform     VARCHAR(20) NOT NULL DEFAULT 'WEB',
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Refreshed every time the client re-registers. Devices that stop checking
    -- in are pruned once FCM reports their token dead.
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT push_devices_platform_chk CHECK (platform IN ('WEB','ANDROID','IOS'))
);

-- Every send starts with "which devices does this user have".
CREATE INDEX idx_push_devices_user ON push_devices(user_id);

-- Per-user opt-outs. Absent row = every default below, so an account that never
-- touches the settings still behaves correctly and no backfill is needed.
--
-- There is deliberately no moderation switch: warnings, suspensions and order
-- holds are things the platform does *to* an account, and letting someone mute
-- those would make enforcement invisible to the person it applies to.
CREATE TABLE notification_preferences (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- Master switch. Off means no push at all; in-app notifications continue,
    -- because those are a record, not an interruption.
    push_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
    messages       BOOLEAN     NOT NULL DEFAULT TRUE,
    orders         BOOLEAN     NOT NULL DEFAULT TRUE,
    reviews        BOOLEAN     NOT NULL DEFAULT TRUE,
    price_drops    BOOLEAN     NOT NULL DEFAULT TRUE,
    system_updates BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
