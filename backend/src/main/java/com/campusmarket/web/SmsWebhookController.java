package com.campusmarket.web;

import com.campusmarket.service.PhoneVerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Where the SMS gateway posts messages it has received.
 *
 * <p>The gateway is an Android handset with a SIM in it, running an app that
 * forwards incoming texts over HTTP. It has no account and cannot hold a
 * session, so this endpoint is authenticated by a shared secret instead -
 * checked inside {@link PhoneVerificationService#receiveInbound}, which fails
 * closed when none is configured.
 *
 * <p>The reply says nothing about what happened. A gateway cannot act on the
 * difference, and an endpoint that answered "no verification pending for that
 * number" would be a way to ask which numbers are mid-signup.
 */
@RestController
@RequestMapping("/api/webhooks/sms")
@RequiredArgsConstructor
public class SmsWebhookController {

    private final PhoneVerificationService phoneVerificationService;

    /**
     * @param from the sender as the network reported it - the thing being
     *             proven, so it must come from the handset, never from the body
     *             of a message a stranger could compose.
     */
    public record InboundSms(String from, String body) {}

    @PostMapping("/inbound")
    public Map<String, Object> inbound(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody(required = false) InboundSms message) {

        String secret = authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7)
                ? authorization.substring(7).trim()
                : authorization;

        phoneVerificationService.receiveInbound(
                secret,
                message == null ? null : message.from(),
                message == null ? null : message.body());

        return Map.of("received", true);
    }
}
