package com.campusmarket.domain;

/** How a user proves who they are. Google accounts have no local password. */
public enum AuthProvider {
    LOCAL,
    GOOGLE
}
