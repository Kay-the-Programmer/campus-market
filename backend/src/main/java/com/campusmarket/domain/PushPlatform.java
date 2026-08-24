package com.campusmarket.domain;

/**
 * Where a {@link PushDevice} registration came from. Only WEB is issued today;
 * the others exist so a native client can register against the same table
 * without a migration.
 */
public enum PushPlatform {
    WEB,
    ANDROID,
    IOS
}
