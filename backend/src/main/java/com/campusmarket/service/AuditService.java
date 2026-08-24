package com.campusmarket.service;

import com.campusmarket.domain.AuditAction;
import com.campusmarket.domain.AuditLog;
import com.campusmarket.domain.User;
import com.campusmarket.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Writes the admin audit trail. Every admin action that modifies another user's
 * data must call this (RBAC rule 4).
 */
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public AuditLog record(User admin,
                           AuditAction action,
                           String targetType,
                           UUID targetId,
                           String reason,
                           String details) {
        AuditLog log = new AuditLog();
        log.setAdmin(admin);
        log.setAction(action);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setReason(reason);
        log.setDetails(details);
        return auditLogRepository.save(log);
    }
}
