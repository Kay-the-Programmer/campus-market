package com.campusmarket.repository;

import com.campusmarket.domain.SellerApplicationMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface SellerApplicationMessageRepository extends JpaRepository<SellerApplicationMessage, UUID> {

    List<SellerApplicationMessage> findByApplicantIdOrderByCreatedAtAsc(UUID applicantId);

    /**
     * Marks one side's messages in a thread as read by the other.
     *
     * <p>A bulk UPDATE rather than loading and saving each row: the thread is
     * opened far more often than it is written to, and the common case is
     * "nothing to mark". clearAutomatically so the entities the caller then
     * reads for display reflect the write.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update SellerApplicationMessage m
               set m.readAt = :now
             where m.applicant.id = :applicantId
               and m.fromAdmin = :fromAdmin
               and m.readAt is null
            """)
    int markRead(@Param("applicantId") UUID applicantId,
                 @Param("fromAdmin") boolean fromAdmin,
                 @Param("now") Instant now);

    long countByApplicantIdAndFromAdminAndReadAtIsNull(UUID applicantId, boolean fromAdmin);

    /**
     * Unread-from-applicant counts for every applicant that has any, in one
     * query - what the admin's pending queue needs to badge its rows without
     * a count per row.
     */
    @Query("""
            select m.applicant.id as applicantId, count(m) as unread
              from SellerApplicationMessage m
             where m.fromAdmin = false
               and m.readAt is null
             group by m.applicant.id
            """)
    List<UnreadRow> unreadFromApplicants();

    /** Projection for {@link #unreadFromApplicants}. */
    interface UnreadRow {
        UUID getApplicantId();
        long getUnread();
    }

    /** Convenience over {@link #unreadFromApplicants}. */
    default Map<UUID, Long> unreadFromApplicantsById() {
        return unreadFromApplicants().stream()
                .collect(java.util.stream.Collectors.toMap(UnreadRow::getApplicantId, UnreadRow::getUnread));
    }
}
