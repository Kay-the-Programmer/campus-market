package com.campusmarket.service;

import com.campusmarket.web.error.ApiException;
import org.springframework.stereotype.Component;

@Component
public class PasswordPolicy {

    private static final int MIN_LENGTH = 8;

    /**
     * BCrypt silently ignores anything past 72 bytes, so a longer password would
     * give a false sense of strength. Reject rather than truncate.
     */
    private static final int MAX_LENGTH = 72;

    public void validate(String password) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw ApiException.badRequest("WEAK_PASSWORD",
                    "Password must be at least " + MIN_LENGTH + " characters.");
        }
        if (password.length() > MAX_LENGTH) {
            throw ApiException.badRequest("WEAK_PASSWORD",
                    "Password must be at most " + MAX_LENGTH + " characters.");
        }
        boolean hasLetter = password.chars().anyMatch(Character::isLetter);
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        if (!hasLetter || !hasDigit) {
            throw ApiException.badRequest("WEAK_PASSWORD",
                    "Password must include at least one letter and one number.");
        }
    }
}
