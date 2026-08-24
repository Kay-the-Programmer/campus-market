package com.campusmarket.web.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthRequests {
    private AuthRequests() {}

    public record SignupRequest(
            @NotBlank(message = "Name is required.")
            @Size(max = 120, message = "Name is too long.")
            String name,

            @NotBlank(message = "Email is required.")
            @Email(message = "Enter a valid campus email address.")
            String email,

            @NotBlank(message = "Password is required.")
            String password,

            /** BUYER or SELLER. Required - the choice gates listing creation. */
            @NotBlank(message = "Choose whether you're here to buy or sell.")
            String accountType,

            /** DOWNSCHOOL | UPSCHOOL | ACROSS. */
            @NotBlank(message = "Choose your campus location.")
            String campusZone,

            String phone,
            String department,
            String year
    ) {}

    public record GoogleSignInRequest(
            @NotBlank(message = "Missing Google credential.")
            String idToken,

            /*
             * These three are only applied the first time this Google account
             * signs in. They are optional because the popup runs before the
             * profile step: the first call creates the account and reports
             * needsProfile, then the client re-posts with the answers.
             */
            String accountType,
            String campusZone,
            String phone
    ) {}

    /** Upgrading a BUYER account in place so they can start listing. */
    public record BecomeSellerRequest(
            /** Optional - lets someone correct their zone while upgrading. */
            String campusZone
    ) {}

    public record LoginRequest(
            @NotBlank(message = "Email is required.")
            String email,

            @NotBlank(message = "Password is required.")
            String password
    ) {}

    public record TokenRequest(
            @NotBlank(message = "Token is required.")
            String token
    ) {}

    public record EmailOnlyRequest(
            @NotBlank(message = "Email is required.")
            @Email(message = "Enter a valid email address.")
            String email
    ) {}

    public record ResetPasswordRequest(
            @NotBlank(message = "Token is required.")
            String token,

            @NotBlank(message = "Password is required.")
            String password,

            @NotBlank(message = "Please confirm your password.")
            String confirmPassword
    ) {}
}
