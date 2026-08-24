package com.campusmarket.service;

import com.campusmarket.domain.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Development stand-in: writes the verification / reset link to the container log
 * instead of sending mail, so workflows 2 and 4 are exercisable without an SMTP
 * provider. Paired with {@code campusmarket.expose-dev-tokens}, which also returns
 * the token in the API response.
 *
 * <p>Replace with an SMTP or transactional-email implementation for production;
 * nothing outside this class needs to change.
 */
@Service
@Slf4j
public class LoggingEmailService implements EmailService {

    @Override
    public void sendVerificationEmail(User user, String token) {
        log.info("""

                ==================== VERIFICATION EMAIL ====================
                To      : {} <{}>
                Subject : Verify your CampusMarket account
                Link    : http://localhost:3000/verify-email?token={}
                Code    : {}
                ============================================================
                """, user.getName(), user.getEmail(), token, token);
    }

    @Override
    public void sendPasswordResetEmail(User user, String token) {
        log.info("""

                =================== PASSWORD RESET EMAIL ===================
                To      : {} <{}>
                Subject : Reset your CampusMarket password
                Link    : http://localhost:3000/reset-password?token={}
                Expires : 30 minutes
                ============================================================
                """, user.getName(), user.getEmail(), token);
    }
}
