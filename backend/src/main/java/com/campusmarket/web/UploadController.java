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

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Accepts an image and returns the URL that serves it.
 *
 * <p>Any signed-in user may upload: the endpoint stores bytes and nothing else,
 * and knows nothing about what the image is for. Whether the caller may attach
 * it to the thing it is about to become part of (a listing, a promo slot) is
 * enforced separately, where that request is validated.
 */
@RestController
@RequiredArgsConstructor
public class UploadController {

    private final ImageStorageService imageStorageService;
    private final AccessGuard accessGuard;

    /**
     * @param file  the full-size image
     * @param thumb optional card-size rendition of the same image, made by the
     *              client. Stored under the same id so it is derivable from
     *              {@code url} by convention - see ImageStorageService.THUMB_SUFFIX.
     */
    @PostMapping("/api/uploads/image")
    public Map<String, String> uploadImage(@AuthPrincipal Principal principal,
                                           @RequestParam("file") MultipartFile file,
                                           @RequestParam(value = "thumb", required = false) MultipartFile thumb) {
        accessGuard.requireAuthenticated(principal);
        ImageStorageService.Stored stored = imageStorageService.store(file, thumb);

        // LinkedHashMap rather than Map.of: thumbUrl is legitimately null when
        // no thumbnail was sent, and Map.of rejects null values.
        Map<String, String> body = new LinkedHashMap<>();
        body.put("url", stored.url());
        body.put("thumbUrl", stored.thumbUrl());
        return body;
    }
}
