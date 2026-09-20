package com.campusmarket.repository;

import com.campusmarket.domain.NotificationPreference;
import com.campusmarket.domain.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, UUID> {

    /**
     * Everyone who may be sent a campaign, before the audience segment is
     * applied.
     *
     * <p>The join is written out rather than mapped, because
     * NotificationPreference holds a bare {@code user_id} rather than an
     * association - V6 built it as a satellite table keyed by the user, and
     * adding a @ManyToOne now would change how every existing query loads.
     *
     * <p>Banned accounts are excluded here rather than filtered later: mailing
     * an account that has been permanently banned is both pointless and a good
     * way to collect a spam complaint from the most motivated possible
     * complainant. Suspended accounts are left in - a suspension is temporary
     * and they are still customers.
     *
     * <p>The whole audience comes back in one list. That is fine here and
     * would not be at another scale: a send has to visit every recipient
     * anyway, so paging would move the same rows in more round trips. The
     * ceiling is memory, and a campus-sized audience is nowhere near it.
     */
    @Query("""
            select new com.campusmarket.repository.MarketingRecipient(
                u.id, u.email, u.name, u.accountType, u.sellerApprovalStatus, p.unsubscribeToken)
            from NotificationPreference p, com.campusmarket.domain.User u
            where p.userId = u.id
              and p.marketingEmails = true
              and u.status <> :excludedStatus
              and u.email is not null
              and u.email <> ''
            order by u.createdAt
            """)
    List<MarketingRecipient> findMarketingRecipients(@Param("excludedStatus") UserStatus excludedStatus);

    Optional<NotificationPreference> findByUnsubscribeToken(UUID unsubscribeToken);
}
