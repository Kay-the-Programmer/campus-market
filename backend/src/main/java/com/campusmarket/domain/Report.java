package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reports")
@Getter
@Setter
@NoArgsConstructor
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "reporter_id", nullable = false)
    private User reporter;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false)
    private ReportEnums.TargetType targetType;

    @ManyToOne
    @JoinColumn(name = "target_listing_id")
    private Listing targetListing;

    @ManyToOne
    @JoinColumn(name = "target_user_id")
    private User targetUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportEnums.Reason reason;

    private String details;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportEnums.Status status = ReportEnums.Status.PENDING;

    @Enumerated(EnumType.STRING)
    private ReportEnums.Resolution resolution;

    @ManyToOne
    @JoinColumn(name = "resolved_by_admin_id")
    private User resolvedByAdmin;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    /** Same reporter, same target, still pending - allowed but flagged (workflow 17). */
    @Column(name = "is_duplicate", nullable = false)
    private boolean duplicate = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public UUID targetId() {
        return targetType == ReportEnums.TargetType.LISTING
                ? (targetListing != null ? targetListing.getId() : null)
                : (targetUser != null ? targetUser.getId() : null);
    }
}
