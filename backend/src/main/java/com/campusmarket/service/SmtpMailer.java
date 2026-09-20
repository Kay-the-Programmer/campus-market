package com.campusmarket.service;

import com.campusmarket.config.AppProperties;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * The only {@link Mailer}. Sends over SMTP when one is configured, and writes
 * to the log when none is.
 *
 * <p>One class rather than two beans and a conditional, because the fallback is
 * not a different strategy - it is the same call with nowhere to go, and a
 * developer running this locally wants to read the mail, not configure a
 * provider. {@code spring.mail.host} is the switch: Spring Boot builds a
 * JavaMailSender only when it is set, so an absent bean means "no SMTP", the
 * same way an absent FirebaseAuth means "no Google sign-in".
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SmtpMailer implements Mailer {

    /**
     * ObjectProvider, not the bean: injecting JavaMailSender directly would
     * make the whole application fail to start on a machine with no mail
     * configured, which is most of them.
     */
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final AppProperties properties;

    @Override
    public boolean isEnabled() {
        return hasHost() && !from().isBlank();
    }

    /**
     * Whether a sender exists AND actually points somewhere.
     *
     * <p>The bean's existence alone is not enough, and this class used to
     * assume it was. Spring Boot's mail auto-configuration is gated on
     * {@code spring.mail.host} being <em>present</em>, and the YAML default
     * of {@code ${SPRING_MAIL_HOST:}} makes it present as an empty string -
     * so a JavaMailSender is built with host "" on every box with no SMTP.
     * That sender cannot connect to anything; treating it as "configured"
     * would have campaigns attempt every recipient and record every one as
     * failed. The host check is what makes "blank means off" true.
     */
    private boolean hasHost() {
        JavaMailSender sender = mailSenderProvider.getIfAvailable();
        if (sender instanceof JavaMailSenderImpl impl) {
            return impl.getHost() != null && !impl.getHost().isBlank();
        }
        return sender != null;
    }

    private String from() {
        return properties.getMailFrom() == null ? "" : properties.getMailFrom().trim();
    }

    @Override
    public boolean send(String toEmail, String toName, String subject, String html, String text,
                        Map<String, String> headers) {
        if (toEmail == null || toEmail.isBlank()) {
            return false;
        }

        JavaMailSender sender = mailSenderProvider.getIfAvailable();
        if (sender == null || from().isBlank()) {
            logInstead(toEmail, subject, text);
            return false;
        }

        try {
            MimeMessage message = sender.createMimeMessage();
            // true, UTF-8: multipart (so the text alternative has somewhere to
            // live) and explicit charset, or a pound sign in a price arrives
            // as mojibake.
            MimeMessageHelper helper =
                    new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());

            helper.setFrom(fromAddress());
            helper.setTo(toName == null || toName.isBlank()
                    ? new InternetAddress(toEmail)
                    : new InternetAddress(toEmail, toName, StandardCharsets.UTF_8.name()));
            helper.setSubject(subject);
            // Text first, HTML second - the argument order MimeMessageHelper
            // wants for the alternative part to be the fallback rather than
            // the other way round.
            helper.setText(text, html);

            headers.forEach((name, value) -> {
                try {
                    message.addHeader(name, value);
                } catch (Exception e) {
                    // A header the provider rejects is not worth losing the
                    // message over - List-Unsubscribe is an improvement to
                    // delivery, not a precondition for it.
                    log.debug("Could not set mail header {}: {}", name, e.getMessage());
                }
            });

            sender.send(message);
            return true;
        } catch (UnsupportedEncodingException e) {
            // UTF-8 is guaranteed by the platform; this branch exists only
            // because the constructor declares it.
            log.warn("Unexpected encoding failure mailing {}", toEmail, e);
            return false;
        } catch (RuntimeException | jakarta.mail.MessagingException e) {
            /*
             * Logged and swallowed, never rethrown. Every caller is either a
             * campaign iterating over thousands of addresses or an after-commit
             * hook on someone else's transaction: one bad mailbox must not end
             * the run, and a notification failing to mail must not roll back
             * the order that caused it. Callers see false and count it.
             */
            log.warn("Mail to {} failed: {}", toEmail, e.getMessage());
            return false;
        }
    }

    /**
     * Declares both checked exceptions the two constructors throw: the
     * one-argument form parses the address and throws AddressException (a
     * MessagingException), the three-argument form encodes the display name
     * and throws UnsupportedEncodingException. The caller's try block already
     * catches both.
     */
    private InternetAddress fromAddress()
            throws UnsupportedEncodingException, jakarta.mail.MessagingException {
        String name = properties.getMailFromName();
        return (name == null || name.isBlank())
                ? new InternetAddress(from())
                : new InternetAddress(from(), name, StandardCharsets.UTF_8.name());
    }

    /**
     * No SMTP configured. Prints enough to read the mail and know why it did
     * not go anywhere, the same way LoggingEmailService does for auth mail.
     */
    private void logInstead(String toEmail, String subject, String text) {
        log.info("""

                ======================= EMAIL (not sent) =======================
                To      : {}
                Subject : {}
                {}
                ----------------------------------------------------------------
                No SMTP is configured, so this was logged instead. Set
                SPRING_MAIL_HOST (plus username/password) and
                CAMPUSMARKET_MAIL_FROM to deliver it.
                ================================================================
                """, toEmail, subject, text);
    }
}
