package com.campusmarket.repository;

import com.campusmarket.domain.AuthToken;
import com.campusmarket.domain.AuthTokenType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AuthTokenRepository extends JpaRepository<AuthToken, UUID> {

    Optional<AuthToken> findByToken(String token);

    /** Newest token of a type for a user - drives the resend cooldown. */
    Optional<AuthToken> findFirstByUserIdAndTypeOrderByCreatedAtDesc(UUID userId, AuthTokenType type);
}
