package com.campusmarket.service;

import com.campusmarket.domain.User;

/**
 * Delivery of the transactional emails the auth workflows depend on.
 *
 * <p>Kept behind an interface so a real SMTP/API provider can be dropped in
 * without touching {@code AuthService} - only the implementation changes.
 */
public interface EmailService {

    void sendVerificationEmail(User user, String token);

    void sendPasswordResetEmail(User user, String token);
}
