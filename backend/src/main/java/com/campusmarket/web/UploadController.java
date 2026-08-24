package com.campusmarket.web;

import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.ImageStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * Where a listing photo or promo banner actually goes once picked.
 *
 * <p>Any signed-in account may call this - it only writes a file and hands
 * back its URL, and does not attach it to anything. What that URL is allowed
 * to become part of (a listing, a promo slot) is enforced separately, where
 * that request is validated.
 */
@RestController
@RequiredArgsConstructor
public class UploadController {

    private final ImageStorageService imageStorageService;
    private final AccessGuard accessGuard;

    @PostMapping("/api/uploads/image")
    public Map<String, String> uploadImage(@AuthPrincipal Principal principal,
                                           @RequestParam("file") MultipartFile file) {
        accessGuard.requireAuthenticated(principal);
        return Map.of("url", imageStorageService.store(file));
    }
}
