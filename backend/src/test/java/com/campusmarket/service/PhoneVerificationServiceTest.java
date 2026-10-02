package com.campusmarket.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The two pure decisions in inbound phone verification.
 *
 * <p>Both are places where a wrong answer fails silently rather than loudly:
 * an unmatched number means a verification that simply never completes, with a
 * student staring at a spinner and nothing in the log to explain it.
 */
class PhoneVerificationServiceTest {

    @Test
    @DisplayName("the same line in two formats is recognised as the same line")
    void matchesAcrossFormats() {
        // What a student types, against what the network reports as the sender.
        assertThat(PhoneVerificationService.sameNumber("0971234567", "+260971234567")).isTrue();
        assertThat(PhoneVerificationService.sameNumber("+260971234567", "0971234567")).isTrue();
        assertThat(PhoneVerificationService.sameNumber("097 123 4567", "+260 97 123 4567")).isTrue();
        assertThat(PhoneVerificationService.sameNumber("260971234567", "0971234567")).isTrue();
    }

    @Test
    @DisplayName("different lines are not collapsed together")
    void rejectsDifferentNumbers() {
        assertThat(PhoneVerificationService.sameNumber("0971234567", "0971234568")).isFalse();
        assertThat(PhoneVerificationService.sameNumber("0971234567", "0966000111")).isFalse();
        assertThat(PhoneVerificationService.sameNumber(null, "0971234567")).isFalse();
        assertThat(PhoneVerificationService.sameNumber("0971234567", null)).isFalse();
    }

    @Test
    @DisplayName("the code survives however the message arrives")
    void extractsCode() {
        assertThat(PhoneVerificationService.extractCode("CampusMarket 483920")).isEqualTo("483920");
        // Keyboards capitalise, people retype, gateways add their own wrapping.
        assertThat(PhoneVerificationService.extractCode("campusmarket 483920")).isEqualTo("483920");
        assertThat(PhoneVerificationService.extractCode("  483920  ")).isEqualTo("483920");
        assertThat(PhoneVerificationService.extractCode("Sent: CampusMarket 483920 (via SMS)"))
                .isEqualTo("483920");
    }

    @Test
    @DisplayName("a message with no six-digit run yields nothing to match on")
    void extractsNothingFromJunk() {
        assertThat(PhoneVerificationService.extractCode("hello")).isNull();
        assertThat(PhoneVerificationService.extractCode("12345")).isNull();
        assertThat(PhoneVerificationService.extractCode(null)).isNull();
    }

    @Test
    @DisplayName("a number too short to be one is rejected rather than stored")
    void normalisesOrRejects() {
        assertThat(PhoneVerificationService.normalise("+260 97 123 4567")).isEqualTo("+260971234567");
        assertThat(PhoneVerificationService.normalise("097-123-4567")).isEqualTo("0971234567");
        assertThat(PhoneVerificationService.normalise("12345")).isNull();
        assertThat(PhoneVerificationService.normalise(null)).isNull();
    }
}
