package com.campusmarket.repository;

import com.campusmarket.domain.Report;
import com.campusmarket.domain.ReportEnums;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ReportRepository extends JpaRepository<Report, UUID> {

    List<Report> findByStatusOrderByCreatedAtAsc(ReportEnums.Status status);

    List<Report> findAllByOrderByCreatedAtDesc();

    /**
     * The full moderation queue (workflow 19): still-open reports first, oldest
     * first inside each group, so admins always work the backlog in arrival order.
     */
    @Query("select r from Report r "
            + "order by case when r.status = :openStatus then 0 else 1 end asc, r.createdAt asc")
    List<Report> findAllOrderedForQueue(@Param("openStatus") ReportEnums.Status openStatus);

    long countByStatus(ReportEnums.Status status);

    /** What other people have said about this account - the single most useful
     *  thing to know before granting it the right to sell. */
    List<Report> findByTargetUserIdOrderByCreatedAtDesc(UUID targetUserId);

    /** Same reporter + same target still pending => flag the new one as duplicate. */
    boolean existsByReporterIdAndTargetListingIdAndStatus(
            UUID reporterId, UUID targetListingId, ReportEnums.Status status);

    boolean existsByReporterIdAndTargetUserIdAndStatus(
            UUID reporterId, UUID targetUserId, ReportEnums.Status status);
}
