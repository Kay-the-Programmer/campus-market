package com.campusmarket.repository;

import com.campusmarket.domain.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    Optional<UserSession> findByToken(String token);

    /** Join-fetches the user so the auth filter can read it outside a transaction. */
    @Query("select s from UserSession s join fetch s.user where s.token = :token")
    Optional<UserSession> findByTokenWithUser(@Param("token") String token);

    /** Used on ban/suspend (RBAC rule 7) and password reset (workflow 4 step 5). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserSession s set s.revokedAt = :now "
            + "where s.user.id = :userId and s.revokedAt is null")
    int revokeAllForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserSession s set s.revokedAt = :now "
            + "where s.user.id = :userId and s.revokedAt is null and s.token <> :keepToken")
    int revokeAllForUserExcept(@Param("userId") UUID userId,
                               @Param("keepToken") String keepToken,
                               @Param("now") Instant now);
}
