package com.campusmarket.web;

import com.campusmarket.service.EmailUnsubscribeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The unsubscribe link in every campaign email.
 *
 * <p>Public by omission, which is the intent: it never consults
 * {@code AccessGuard}, because the whole point is that it works from a mail
 * client with no session. The token is the authorisation.
 *
 * <p>It answers HTML rather than JSON and does not hand off to a frontend
 * route. An unsubscribe has to work when the SPA is mid-deploy, when the click
 * comes from a webmail preview pane, and when JavaScript never runs - so it is
 * one request to one endpoint that does the thing and says so.
 */
@RestController
@RequestMapping("/api/email")
@RequiredArgsConstructor
public class EmailUnsubscribeController {

    private final EmailUnsubscribeService unsubscribeService;

    /**
     * RFC 8058 one-click. Gmail and Outlook POST here from their own
     * unsubscribe button, with no body and no session, and expect a 2xx.
     *
     * <p>Declared before the GET mapping because this is the one that matters
     * for deliverability: the large mailbox providers check that the header
     * they were given actually works.
     */
    @PostMapping(value = "/unsubscribe/{token}", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> unsubscribeOneClick(@PathVariable String token) {
        unsubscribeService.unsubscribe(token);
        /*
         * 200 whether or not the token matched. A mail provider reads a
         * non-2xx as "the unsubscribe mechanism is broken", which is worse for
         * the domain than silently ignoring a stale token - and a public
         * endpoint that answers differently for a valid token would let
         * anyone test which tokens exist.
         */
        return ResponseEntity.ok()
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .body("Unsubscribed.");
    }

    /**
     * What a person gets when they click the link in the footer.
     *
     * <p>A GET that changes state, which is ordinarily wrong and is right
     * here: every mail client renders the footer as a plain link, and an
     * interstitial "click to confirm" page turns a one-click opt-out into a
     * two-step one. The token is single-purpose and the action is idempotent,
     * so a prefetch costs nothing beyond what the reader asked for anyway.
     */
    @GetMapping(value = "/unsubscribe/{token}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> unsubscribePage(@PathVariable String token) {
        boolean known = unsubscribeService.unsubscribe(token);
        return ResponseEntity.ok()
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_HTML_VALUE + ";charset=UTF-8")
                .body(page(known));
    }

    private String page(boolean known) {
        String heading = known ? "You're unsubscribed" : "This link has expired";
        String message = known
                ? """
                  You won't receive announcement emails from CampusMarket any more.
                  You will still get email about your own orders and messages - you can
                  turn those off in your notification settings.
                  """
                : """
                  We couldn't match that unsubscribe link, which usually means it has
                  already been used or the address was removed. If you are still getting
                  announcements, open your notification settings and turn them off there.
                  """;

        // Self-contained: inline styles, no assets, no script. This page is
        // reached from an inbox and has to render correctly on its own.
        return """
                <!doctype html>
                <html lang="en"><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>%s — CampusMarket</title></head>
                <body style="margin:0;background:#f1f2f7;font-family:-apple-system,
                             BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <div style="max-width:460px;margin:12vh auto;background:#ffffff;
                              border-radius:16px;padding:32px;">
                    <div style="font-size:15px;font-weight:800;color:#0b1c30;
                                margin-bottom:20px;">CampusMarket</div>
                    <h1 style="margin:0 0 12px 0;font-size:20px;color:#0b1c30;">%s</h1>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#434655;">%s</p>
                  </div>
                </body></html>
                """.formatted(heading, heading, message);
    }
}
