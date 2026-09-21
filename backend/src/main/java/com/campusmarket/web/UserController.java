package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.PhoneVerificationService;
import com.campusmarket.service.SellerApplicationChatService;
import com.campusmarket.service.UserProfileService;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserProfileService userProfileService;
    private final PhoneVerificationService phoneVerificationService;
    private final SellerApplicationChatService applicationChat;

    /** Public profile - guests may view it, minus any contact details. */
    @GetMapping("/{id}")
    public Map<String, Object> profile(@AuthPrincipal Principal principal, @PathVariable UUID id) {
        return userProfileService.getProfile(principal, id);
    }

    @GetMapping("/me")
    public Map<String, Object> ownProfile(@AuthPrincipal Principal principal) {
        if (principal.isGuest()) {
            throw ApiException.unauthorized("Please log in to view your profile.");
        }
        return userProfileService.getProfile(principal, principal.id());
    }

    /** No id in the path or the body - you can only ever edit yourself. */
    public record UpdateProfileRequest(
            String name,
            String bio,
            String department,
            String year,
            String campusZone,
            String avatarUrl,
            String privateAddress) {}

    @PutMapping("/me")
    public Map<String, Object> updateOwnProfile(@AuthPrincipal Principal principal,
                                                @RequestBody UpdateProfileRequest request) {
        return userProfileService.updateOwnProfile(
                principal,
                request.name(),
                request.bio(),
                request.department(),
                request.year(),
                request.campusZone(),
                request.avatarUrl(),
                request.privateAddress());
    }

    // ------------------------------------------------------ phone verification
    public record PhoneRequest(String phone) {}

    public record CodeRequest(String code) {}

    /** Issues a code to the number given. The number is only stored as pending
     *  until the code comes back, so a typo cannot clear a verified one. */
    @PostMapping("/me/phone/send-code")
    public Map<String, Object> sendPhoneCode(@AuthPrincipal Principal principal,
                                             @RequestBody PhoneRequest request) {
        return phoneVerificationService.sendCode(principal, request == null ? null : request.phone());
    }

    @PostMapping("/me/phone/verify")
    public Map<String, Object> verifyPhone(@AuthPrincipal Principal principal,
                                           @RequestBody CodeRequest request) {
        return phoneVerificationService.verifyCode(principal, request == null ? null : request.code());
    }

    // ------------------------------------------- seller application thread
    public record ApplicationMessageRequest(String body) {}

    /**
     * The applicant's side of the conversation with an admin about their
     * seller application. Reading marks the admin's messages read.
     */
    @GetMapping("/me/seller-application/messages")
    public Map<String, Object> myApplicationThread(@AuthPrincipal Principal principal) {
        return Map.of("messages", applicationChat.thread(principal, principal.id()));
    }

    @PostMapping("/me/seller-application/messages")
    public Map<String, Object> replyToAdmin(@AuthPrincipal Principal principal,
                                            @RequestBody ApplicationMessageRequest request) {
        return Map.of("success", true,
                "message", applicationChat.post(principal, principal.id(), request == null ? null : request.body()));
    }

    /** Unread admin messages about the application, for a badge. */
    @GetMapping("/me/seller-application/unread")
    public Map<String, Object> myApplicationUnread(@AuthPrincipal Principal principal) {
        return Map.of("unread", applicationChat.unreadFromAdmin(principal));
    }
}
