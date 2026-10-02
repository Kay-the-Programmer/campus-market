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

            /**
             * Required. Buyers and sellers meet in person to hand things over,
             * and the number is how they arrange it - an account without one
             * cannot complete the thing the site exists to do.
             */
            @NotBlank(message = "Add a phone number so you can be reached at a handover.")
            String phone,

            String department,
            String year,

            /**
             * The seller terms version the client displayed and the applicant
             * accepted. Required when accountType is SELLER, ignored otherwise
             * - a buyer is never shown them.
             */
            String acceptedTermsVersion
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

            /**
             * Deliberately not {@code @NotBlank}, although a phone number is
             * required to finish registering. The first leg of this flow runs
             * before anybody has been asked for one, so a constraint here
             * would reject the very call whose job is to report
             * {@code needsProfile}. AuthService requires it on the leg that
             * actually completes the profile instead.
             */
            String phone,

            /** As above: required only when accountType is SELLER. */
            String acceptedTermsVersion
    ) {}

    /** Upgrading a BUYER account in place so they can start listing. */
    public record BecomeSellerRequest(
            /** Optional - lets someone correct their zone while upgrading. */
            String campusZone,

            /**
             * The seller terms version shown and accepted. Required: this
             * request IS the application, so there is no version of it that
             * does not need one.
             */
            String acceptedTermsVersion
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
