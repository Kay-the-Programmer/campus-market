package com.campusmarket.repository;

import com.campusmarket.domain.AuditLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    List<AuditLog> findAllByOrderByCreatedAtDesc();

    List<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
