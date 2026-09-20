package com.campusmarket.config;

import com.campusmarket.service.Mailer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.mail.MailHealthIndicator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Health for the mail channel that understands "not configured".
 *
 * <p>Spring Boot's own {@code MailHealthIndicator} opens a connection to the
 * SMTP host and reports DOWN if it cannot. That is the right check when mail
 * is meant to work. It is the wrong check on a box that has no SMTP at all -
 * and because the auto-configuration builds a sender for an empty host (see
 * {@code SmtpMailer#hasHost}), that is exactly the box this ran on: the whole
 * application reported DOWN, the container healthcheck failed, and nothing
 * was actually wrong.
 *
 * <p>Mail is optional by design here, like Google sign-in and GCS. An optional
 * feature that is switched off is not a health problem; it is a fact. So this
 * bean - named to take precedence over the auto-configured one - reports UP
 * with a note when mail is off, and defers to Boot's real connection test
 * only when mail is on and a broken SMTP would genuinely be a failure.
 */
@Configuration
public class MailHealthConfig {

    @Bean("mailHealthIndicator")
    public HealthIndicator mailHealthIndicator(Mailer mailer,
                                               ObjectProvider<JavaMailSenderImpl> senderProvider) {
        return () -> {
            if (!mailer.isEnabled()) {
                return Health.up().withDetail("mail", "not configured").build();
            }
            JavaMailSenderImpl sender = senderProvider.getIfAvailable();
            if (sender == null) {
                // isEnabled() implies a sender; reaching here means the
                // wiring changed underneath this class. Say so rather than
                // reporting a connection that was never attempted.
                return Health.unknown().withDetail("mail", "sender unavailable").build();
            }
            return new MailHealthIndicator(sender).health();
        };
    }
}
